"""Main window: batch/filter sidebar, paper table, and the per-paper workspace."""

from __future__ import annotations

from typing import Optional

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from .. import config, eval_import, export, importer, ingest
from ..db import Store
from ..models import Bucket, Paper
from .paper_panel import PaperPanel

_ALL_BATCHES = -1


class MainWindow(QMainWindow):
    def __init__(self, store: Store) -> None:
        super().__init__()
        self.store = store
        self.setWindowTitle("Paper Factory")
        self.resize(1280, 820)

        # --- sidebar ---
        self.batch_list = QListWidget()
        self.batch_list.itemSelectionChanged.connect(self.refresh_table)
        self.bucket_filter = QComboBox()
        self.bucket_filter.addItem("All buckets", None)
        for b in Bucket:
            self.bucket_filter.addItem(b.value, b.value)
        self.bucket_filter.currentIndexChanged.connect(self.refresh_table)
        self.counts_label = QLabel()

        new_batch_btn = QPushButton("New batch from selection")
        new_batch_btn.clicked.connect(self.new_batch)

        sidebar = QWidget()
        sl = QVBoxLayout(sidebar)
        sl.addWidget(QLabel("Batches"))
        sl.addWidget(self.batch_list, 1)
        sl.addWidget(QLabel("Filter"))
        sl.addWidget(self.bucket_filter)
        sl.addWidget(new_batch_btn)
        sl.addWidget(self.counts_label)

        # --- table ---
        self.table = QTableWidget()
        self.table.setColumnCount(5)
        self.table.setHorizontalHeaderLabels(["Title", "Venue", "Bucket", "Stage", "Score"])
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.horizontalHeader().setStretchLastSection(False)
        self.table.setColumnWidth(0, 360)
        self.table.itemSelectionChanged.connect(self.on_select_paper)

        # --- workspace ---
        self.panel = PaperPanel(self.store)
        self.panel.changed.connect(self.refresh_table)

        center = QSplitter(Qt.Horizontal)
        left = QWidget()
        ll = QVBoxLayout(left)
        ll.addWidget(self.table)
        center.addWidget(left)
        center.addWidget(self.panel)
        center.setStretchFactor(0, 1)
        center.setStretchFactor(1, 2)

        outer = QSplitter(Qt.Horizontal)
        outer.addWidget(sidebar)
        outer.addWidget(center)
        outer.setStretchFactor(0, 0)
        outer.setStretchFactor(1, 1)
        outer.setSizes([240, 1040])
        self.setCentralWidget(outer)

        self._build_toolbar()
        self.refresh_batches()
        self.refresh_table()

    # ---------- toolbar ----------
    def _build_toolbar(self) -> None:
        tb = self.addToolBar("main")
        tb.setMovable(False)
        actions = [
            ("Import inbox", self.import_inbox),
            ("Export for eval", self.export_batch),
            ("Import eval results", self.import_eval),
            ("Ingest passed", self.ingest_passed),
        ]
        for label, slot in actions:
            btn = QPushButton(label)
            btn.clicked.connect(slot)
            tb.addWidget(btn)

    # ---------- data helpers ----------
    @property
    def current_batch_id(self) -> Optional[int]:
        items = self.batch_list.selectedItems()
        if not items:
            return None
        data = items[0].data(Qt.UserRole)
        return None if data == _ALL_BATCHES else data

    def refresh_batches(self) -> None:
        self.batch_list.blockSignals(True)
        self.batch_list.clear()
        all_item = QListWidgetItem("All papers")
        all_item.setData(Qt.UserRole, _ALL_BATCHES)
        self.batch_list.addItem(all_item)
        for b in self.store.list_batches():
            it = QListWidgetItem(f"{b.name}  (#{b.id})")
            it.setData(Qt.UserRole, b.id)
            self.batch_list.addItem(it)
        self.batch_list.setCurrentRow(0)
        self.batch_list.blockSignals(False)

    def refresh_table(self) -> None:
        bucket = self.bucket_filter.currentData()
        papers = self.store.list_papers(batch_id=self.current_batch_id, bucket=bucket)
        self._papers = papers
        self.table.setRowCount(len(papers))
        for row, p in enumerate(papers):
            self.table.setItem(row, 0, _cell(p.title, p.id))
            self.table.setItem(row, 1, _cell(p.venue or "—"))
            self.table.setItem(row, 2, _cell(p.bucket.value))
            self.table.setItem(row, 3, _cell(p.stage.value + (" ⚠" if p.failed_step else "")))
            self.table.setItem(row, 4, _cell("" if p.total_score is None else str(p.total_score)))
        c = self.store.counts_by_bucket()
        self.counts_label.setText(
            f"pending {c['pending']} · processing {c['processing']} · finish {c['finish']}"
        )

    # ---------- slots ----------
    def on_select_paper(self) -> None:
        rows = self.table.selectionModel().selectedRows()
        if not rows:
            self.panel.show_paper(None)
            return
        paper_id = self.table.item(rows[0].row(), 0).data(Qt.UserRole)
        self.panel.show_paper(self.store.get_paper(paper_id))

    def selected_paper_ids(self) -> list[str]:
        return [
            self.table.item(idx.row(), 0).data(Qt.UserRole)
            for idx in self.table.selectionModel().selectedRows()
        ]

    def import_inbox(self) -> None:
        results = importer.import_inbox(self.store)
        total_ins = sum(i for i, _ in results.values())
        total_skip = sum(s for _, s in results.values())
        self.refresh_table()
        if not results:
            QMessageBox.information(self, "Import inbox", f"No JSON files in {config.INBOX_DIR}")
        else:
            QMessageBox.information(
                self, "Import inbox",
                f"{len(results)} file(s): {total_ins} new, {total_skip} already known.",
            )

    def new_batch(self) -> None:
        ids = self.selected_paper_ids()
        if not ids:
            QMessageBox.information(self, "New batch", "Select papers in the table first.")
            return
        name, ok = QInputDialog.getText(self, "New batch", "Batch name:")
        if not ok or not name.strip():
            return
        batch = self.store.create_batch(name.strip())
        self.store.assign_batch(ids, batch.id)
        self.refresh_batches()
        self.refresh_table()

    def export_batch(self) -> None:
        bid = self.current_batch_id
        if bid is None:
            QMessageBox.information(self, "Export", "Select a specific batch in the sidebar first.")
            return
        try:
            out = export.export_batch(self.store, bid)
        except ValueError as e:
            QMessageBox.warning(self, "Export", str(e))
            return
        self.refresh_table()
        QMessageBox.information(self, "Export", f"Bundle written to:\n{out}")

    def import_eval(self) -> None:
        start = str(config.EXPORT_DIR)
        path, _ = QFileDialog.getOpenFileName(self, "Pick evaluations.json", start, "JSON (*.json)")
        if not path:
            return
        matched, unmatched = eval_import.import_evaluations(self.store, path)
        self.refresh_table()
        self.on_select_paper()
        QMessageBox.information(self, "Import eval", f"{matched} matched, {unmatched} unmatched.")

    def ingest_passed(self) -> None:
        try:
            run_dir, result, papers = ingest.ingest_passed(self.store)
        except ValueError as e:
            QMessageBox.warning(self, "Ingest", str(e))
            return
        self.refresh_table()
        if result.returncode == 0:
            QMessageBox.information(
                self, "Ingest", f"Ingested {len(papers)} paper(s).\n\n{result.stdout[-1200:]}"
            )
        else:
            QMessageBox.critical(
                self, "Ingest failed",
                f"run dir: {run_dir}\n\nSTDERR:\n{result.stderr[-2000:]}",
            )


def _cell(text: str, user_data: Optional[str] = None) -> QTableWidgetItem:
    item = QTableWidgetItem(text)
    if user_data is not None:
        item.setData(Qt.UserRole, user_data)
    return item

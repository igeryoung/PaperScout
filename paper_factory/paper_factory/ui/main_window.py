"""Main window: collapsible batch/filter sidebar, a Year/Conference/Paper tree, and
the per-paper workspace."""

from __future__ import annotations

import re
from typing import Iterator, Optional

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QComboBox,
    QFileDialog,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QMessageBox,
    QPushButton,
    QSplitter,
    QTabWidget,
    QTreeWidget,
    QTreeWidgetItem,
    QVBoxLayout,
    QWidget,
)

from .. import config, eval_import, export, importer, ingest
from ..db import Store
from ..models import Bucket, Paper, Stage
from .db_page import DbPage
from .paper_panel import PaperPanel

_ALL_BATCHES = -1
_YEAR_RE = re.compile(r"\b(19|20)\d{2}\b")

# Bucket -> leaf text colour, so status reads at a glance.
_BUCKET_COLOR = {
    Bucket.PENDING: QColor("#888888"),
    Bucket.PROCESSING: QColor("#1d6fd6"),
    Bucket.FINISH: QColor("#1f9d55"),
}


class MainWindow(QMainWindow):
    def __init__(self, store: Store) -> None:
        super().__init__()
        self.store = store
        self.setWindowTitle("Paper Factory")
        self.resize(1280, 820)

        # --- sidebar (collapsible) ---
        self.batch_list = QListWidget()
        self.batch_list.itemSelectionChanged.connect(self.refresh_tree)
        self.bucket_filter = QComboBox()
        self.bucket_filter.addItem("All buckets", None)
        for b in Bucket:
            self.bucket_filter.addItem(b.value, b.value)
        self.bucket_filter.currentIndexChanged.connect(self.refresh_tree)
        self.counts_label = QLabel()

        new_batch_btn = QPushButton("New batch from selection")
        new_batch_btn.clicked.connect(self.new_batch)

        self.sidebar = QWidget()
        sl = QVBoxLayout(self.sidebar)
        sl.addWidget(QLabel("Batches"))
        sl.addWidget(self.batch_list, 1)
        sl.addWidget(QLabel("Filter"))
        sl.addWidget(self.bucket_filter)
        sl.addWidget(new_batch_btn)
        sl.addWidget(self.counts_label)
        self.sidebar.setVisible(False)  # hidden by default; toggled from the toolbar

        # --- tree (Year / Conference / Paper) ---
        self.tree = QTreeWidget()
        self.tree.setColumnCount(2)
        self.tree.setHeaderLabels(["Paper", "Score"])
        self.tree.setColumnWidth(0, 460)
        self.tree.header().setStretchLastSection(True)
        self.tree.setSelectionMode(QTreeWidget.ExtendedSelection)
        self.tree.itemSelectionChanged.connect(self.on_select_paper)

        # --- workspace ---
        self.panel = PaperPanel(self.store)
        self.panel.changed.connect(self.refresh_tree)

        center = QSplitter(Qt.Horizontal)
        center.addWidget(self.tree)
        center.addWidget(self.panel)
        center.setStretchFactor(0, 1)
        center.setStretchFactor(1, 2)

        outer = QSplitter(Qt.Horizontal)
        outer.addWidget(self.sidebar)
        outer.addWidget(center)
        outer.setStretchFactor(0, 0)
        outer.setStretchFactor(1, 1)
        outer.setSizes([240, 1040])

        pipeline = QWidget()
        pl = QVBoxLayout(pipeline)
        pl.setContentsMargins(0, 0, 0, 0)
        pl.addWidget(outer)

        # Live DB tab: loaded lazily on first visit so startup never blocks on a
        # subprocess call into Postgres.
        self.db_page = DbPage(self.store)
        self._db_loaded = False

        self.tabs = QTabWidget()
        self.tabs.addTab(pipeline, "Pipeline")
        self.tabs.addTab(self.db_page, "Live DB")
        self.tabs.currentChanged.connect(self._on_tab_changed)
        self.setCentralWidget(self.tabs)

        self._build_toolbar()
        self.refresh_batches()
        self.refresh_tree()

    # ---------- toolbar ----------
    def _build_toolbar(self) -> None:
        tb = self.addToolBar("main")
        self.toolbar = tb
        tb.setMovable(False)
        toggle = QPushButton("☰ Batches")
        toggle.setCheckable(True)
        toggle.toggled.connect(self.sidebar.setVisible)
        tb.addWidget(toggle)
        tb.addSeparator()
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

    def _on_tab_changed(self, index: int) -> None:
        on_db = self.tabs.widget(index) is self.db_page
        # The pipeline toolbar actions don't apply to the Live DB tab.
        self.toolbar.setVisible(not on_db)
        if on_db and not self._db_loaded:
            self._db_loaded = True
            self.db_page.refresh()

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

    def refresh_tree(self) -> None:
        expanded = self._expanded_keys()
        selected_id = self._current_paper_id()
        bucket = self.bucket_filter.currentData()
        papers = self.store.list_papers(batch_id=self.current_batch_id, bucket=bucket)
        self._papers = papers

        self.tree.blockSignals(True)
        self.tree.clear()
        groups: dict[str, dict[str, list[Paper]]] = {}
        for p in papers:
            groups.setdefault(_paper_year(p), {}).setdefault(_paper_conference(p), []).append(p)

        for year in sorted(groups, key=_year_sort_key):
            year_item = QTreeWidgetItem([f"{year}  ({_count(groups[year])})", ""])
            year_item.setData(0, Qt.UserRole, ("year", year))
            self.tree.addTopLevelItem(year_item)
            for conf in sorted(groups[year]):
                conf_papers = groups[year][conf]
                conf_item = QTreeWidgetItem([f"{conf}  ({len(conf_papers)})", ""])
                conf_item.setData(0, Qt.UserRole, ("conf", f"{year}/{conf}"))
                year_item.addChild(conf_item)
                for p in conf_papers:
                    leaf = QTreeWidgetItem([f"{_status_tag(p)}  {p.title}", _score_text(p)])
                    leaf.setData(0, Qt.UserRole, ("paper", p.id))
                    leaf.setForeground(0, _BUCKET_COLOR[p.bucket])
                    conf_item.addChild(leaf)

        self._restore_expansion(expanded, default_expand=not expanded)
        self._select_paper_id(selected_id)
        self.tree.blockSignals(False)

        c = self.store.counts_by_bucket()
        self.counts_label.setText(
            f"pending {c['pending']} · processing {c['processing']} · finish {c['finish']}"
        )

    # ---------- tree traversal ----------
    def _iter_items(self) -> Iterator[QTreeWidgetItem]:
        def walk(item: QTreeWidgetItem) -> Iterator[QTreeWidgetItem]:
            yield item
            for i in range(item.childCount()):
                yield from walk(item.child(i))

        for i in range(self.tree.topLevelItemCount()):
            yield from walk(self.tree.topLevelItem(i))

    def _expanded_keys(self) -> set:
        return {it.data(0, Qt.UserRole) for it in self._iter_items() if it.isExpanded()}

    def _restore_expansion(self, expanded: set, default_expand: bool) -> None:
        for it in self._iter_items():
            key = it.data(0, Qt.UserRole)
            if key and key[0] in ("year", "conf"):
                it.setExpanded(default_expand or key in expanded)

    def _current_paper_id(self) -> Optional[str]:
        it = self.tree.currentItem()
        if it:
            key = it.data(0, Qt.UserRole)
            if key and key[0] == "paper":
                return key[1]
        return None

    def _select_paper_id(self, paper_id: Optional[str]) -> None:
        if not paper_id:
            return
        for it in self._iter_items():
            if it.data(0, Qt.UserRole) == ("paper", paper_id):
                self.tree.setCurrentItem(it)
                return

    # ---------- slots ----------
    def on_select_paper(self) -> None:
        pid = self._current_paper_id()
        self.panel.show_paper(self.store.get_paper(pid) if pid else None)

    def selected_paper_ids(self) -> list[str]:
        out: list[str] = []
        for it in self.tree.selectedItems():
            key = it.data(0, Qt.UserRole)
            if key and key[0] == "paper":
                out.append(key[1])
        return out

    def import_inbox(self) -> None:
        results = importer.import_inbox(self.store)
        total_ins = sum(i for i, _ in results.values())
        total_skip = sum(s for _, s in results.values())
        self.refresh_tree()
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
            QMessageBox.information(self, "New batch", "Select papers in the tree first.")
            return
        name, ok = QInputDialog.getText(self, "New batch", "Batch name:")
        if not ok or not name.strip():
            return
        batch = self.store.create_batch(name.strip())
        self.store.assign_batch(ids, batch.id)
        self.refresh_batches()
        self.refresh_tree()

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
        self.refresh_tree()
        QMessageBox.information(self, "Export", f"Bundle written to:\n{out}")

    def import_eval(self) -> None:
        start = str(config.EXPORT_DIR)
        path, _ = QFileDialog.getOpenFileName(self, "Pick evaluations.json", start, "JSON (*.json)")
        if not path:
            return
        matched, unmatched = eval_import.import_evaluations(self.store, path)
        self.refresh_tree()
        self.on_select_paper()
        QMessageBox.information(self, "Import eval", f"{matched} matched, {unmatched} unmatched.")

    def ingest_passed(self) -> None:
        try:
            run_dir, result, papers = ingest.ingest_passed(self.store)
        except ValueError as e:
            QMessageBox.warning(self, "Ingest", str(e))
            return
        self.refresh_tree()
        if result.returncode == 0:
            QMessageBox.information(
                self, "Ingest", f"Ingested {len(papers)} paper(s).\n\n{result.stdout[-1200:]}"
            )
        else:
            QMessageBox.critical(
                self, "Ingest failed",
                f"run dir: {run_dir}\n\nSTDERR:\n{result.stderr[-2000:]}",
            )


# ---------- grouping / label helpers ----------
def _paper_year(p: Paper) -> str:
    head = (p.published_date or "")[:4]
    return head if head.isdigit() else "Unknown"


def _paper_conference(p: Paper) -> str:
    v = (p.venue or "").strip()
    if not v:
        return "Unknown"
    v = re.sub(r"\s+", " ", _YEAR_RE.sub("", v)).strip(" .-—|")
    return v or "Unknown"


def _year_sort_key(year: str) -> tuple[int, int]:
    # numeric years descending first, "Unknown" pinned to the bottom
    return (0, -int(year)) if year.isdigit() else (1, 0)


def _count(by_conf: dict[str, list[Paper]]) -> int:
    return sum(len(v) for v in by_conf.values())


def _status_tag(p: Paper) -> str:
    return f"[{p.stage.value}{' ⚠' if p.failed_step else ''}]"


def _score_text(p: Paper) -> str:
    return "" if p.total_score is None else str(p.total_score)

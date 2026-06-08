"""The "Live DB" tab: browse, edit, and delete the papers that are actually live
in the app's Postgres DB.

All reads/writes go through :mod:`paper_factory.db_live` (which shells out to the
TS ``factory:db`` CLI). The factory's own SQLite store is only consulted to flag
whether a live paper still has a local pipeline counterpart, and to reset that
counterpart's stage when a live paper is deleted.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Optional

from PySide6.QtCore import Qt
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QApplication,
    QComboBox,
    QDialog,
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QMessageBox,
    QPlainTextEdit,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QSplitter,
    QTableWidget,
    QTableWidgetItem,
    QTabWidget,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from .. import db_live
from ..db import Store
from ..models import Stage
from .eval_render import LOCALES, eval_html

_SORTS = (("Newest", "newest"), ("Oldest", "oldest"), ("Score", "score"))
_DECISIONS = ("RECOMMEND", "STORE_ONLY", "LOW_QUALITY")
_SCORE_DIMS = (
    ("novelty", "Novelty", 25),
    ("methodologicalRigor", "Method. rigor", 30),
    ("experimentalQuality", "Exp. quality", 30),
    ("venueSourceCredibility", "Venue cred.", 15),
)
_EVAL_JSON_FIELDS = (
    ("summary", "Summary"),
    ("recommendationReason", "Recommendation reason"),
    ("strengths", "Strengths"),
    ("weaknesses", "Weaknesses"),
    ("digest", "Digest"),
)
_PAGE_SIZE = 50


class DbPage(QWidget):
    """Self-contained Live DB workspace. Owns its own paging + detail state."""

    def __init__(self, store: Store) -> None:
        super().__init__()
        self.store = store
        self.page = 1
        self.total_pages = 1
        self.current: Optional[dict[str, Any]] = None  # last get_paper() payload
        self.locale = LOCALES[0]

        self._build_filter_bar()
        self._build_table()
        self._build_detail()

        split = QSplitter(Qt.Horizontal)
        split.addWidget(self.table_panel)
        split.addWidget(self.detail)
        split.setStretchFactor(0, 3)
        split.setStretchFactor(1, 4)
        split.setSizes([560, 760])
        self.split = split

        root = QVBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(8)
        root.addLayout(self.filter_bar)
        root.addWidget(split, 1)
        self._set_detail_enabled(False)

    # ---------- construction ----------
    def _build_filter_bar(self) -> None:
        """Filters only — pagination lives in the table footer, where it belongs."""
        self.search = QLineEdit()
        self.search.setClearButtonEnabled(True)
        self.search.setPlaceholderText("Search title / abstract / author…")
        self.search.returnPressed.connect(self.reload_first_page)
        self.venue = QLineEdit()
        self.venue.setPlaceholderText("Venue")
        self.venue.setMaximumWidth(140)
        self.venue.returnPressed.connect(self.reload_first_page)
        self.year = QLineEdit()
        self.year.setPlaceholderText("Year")
        self.year.setMaximumWidth(70)
        self.year.returnPressed.connect(self.reload_first_page)
        self.sort = QComboBox()
        for label, value in _SORTS:
            self.sort.addItem(label, value)
        self.sort.currentIndexChanged.connect(self.reload_first_page)

        search_btn = QPushButton("Search")
        search_btn.clicked.connect(self.reload_first_page)

        self.filter_bar = QHBoxLayout()
        self.filter_bar.setSpacing(6)
        self.filter_bar.addWidget(self.search, 1)
        self.filter_bar.addWidget(self.venue)
        self.filter_bar.addWidget(self.year)
        self.filter_bar.addWidget(QLabel("Sort"))
        self.filter_bar.addWidget(self.sort)
        self.filter_bar.addWidget(search_btn)

    def _build_table(self) -> None:
        self.table = QTableWidget(0, 6)
        self.table.setHorizontalHeaderLabels(
            ["Title", "Venue", "Year", "Score", "Source", "Factory"]
        )
        self.table.verticalHeader().setVisible(False)
        self.table.setSelectionBehavior(QTableWidget.SelectRows)
        # Extended selection so Ctrl/Shift-click can build a set to batch-delete.
        self.table.setSelectionMode(QTableWidget.ExtendedSelection)
        self.table.setEditTriggers(QTableWidget.NoEditTriggers)
        self.table.setAlternatingRowColors(True)
        hdr = self.table.horizontalHeader()
        hdr.setSectionResizeMode(0, QHeaderView.Stretch)
        for c in range(1, 6):
            hdr.setSectionResizeMode(c, QHeaderView.ResizeToContents)
        self.table.itemSelectionChanged.connect(self._on_row_selected)
        self.table.itemSelectionChanged.connect(self._update_selection_actions)

        # Header strip: live result count on the left, batch-delete on the right.
        self.results_label = QLabel("No results")
        self.results_label.setStyleSheet("color:#555; font-weight:600;")
        self.del_selected_btn = QPushButton("🗑 Delete selected")
        self.del_selected_btn.setEnabled(False)
        self.del_selected_btn.clicked.connect(self._delete_selected)
        header_row = QHBoxLayout()
        header_row.addWidget(self.results_label)
        header_row.addStretch(1)
        header_row.addWidget(self.del_selected_btn)

        # Footer strip: pagination sits with the list it pages.
        self.prev_btn = QPushButton("‹ Prev")
        self.prev_btn.clicked.connect(self._prev_page)
        self.next_btn = QPushButton("Next ›")
        self.next_btn.clicked.connect(self._next_page)
        self.page_label = QLabel("")
        self.page_label.setStyleSheet("color:#777;")
        footer_row = QHBoxLayout()
        footer_row.addWidget(self.prev_btn)
        footer_row.addStretch(1)
        footer_row.addWidget(self.page_label)
        footer_row.addStretch(1)
        footer_row.addWidget(self.next_btn)

        self.table_panel = QWidget()
        tl = QVBoxLayout(self.table_panel)
        tl.setContentsMargins(0, 0, 0, 0)
        tl.setSpacing(6)
        tl.addLayout(header_row)
        tl.addWidget(self.table, 1)
        tl.addLayout(footer_row)

    def _build_detail(self) -> None:
        """Sticky header (title + meta + Save/Delete) over a two-tab body."""
        self.detail = QWidget()
        outer = QVBoxLayout(self.detail)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(6)

        # --- sticky header: always visible, so Save/Delete are never a scroll away ---
        self.detail_title = QLabel("Select a paper")
        self.detail_title.setWordWrap(True)
        self.detail_title.setStyleSheet("font-weight:600; font-size:14px;")
        self.f_meta = QLabel("")
        self.f_meta.setStyleSheet("color:#777;")
        self.f_meta.setWordWrap(True)

        self.save_btn = QPushButton("💾 Save changes")
        self.save_btn.clicked.connect(self._save)
        self.delete_btn = QPushButton("🗑 Delete")
        self.delete_btn.clicked.connect(self._delete)
        action_row = QHBoxLayout()
        action_row.addWidget(self.save_btn)
        action_row.addStretch(1)
        action_row.addWidget(self.delete_btn)

        header = QWidget()
        hv = QVBoxLayout(header)
        hv.setContentsMargins(0, 0, 0, 0)
        hv.setSpacing(4)
        hv.addWidget(self.detail_title)
        hv.addWidget(self.f_meta)
        hv.addLayout(action_row)

        # --- body: edit metadata on one tab, review/score on the other ---
        self.detail_tabs = QTabWidget()
        self.detail_tabs.addTab(self._build_details_tab(), "Details")
        self.detail_tabs.addTab(self._build_eval_tab(), "Evaluation")

        outer.addWidget(header)
        outer.addWidget(self._hline())
        outer.addWidget(self.detail_tabs, 1)

    def _build_details_tab(self) -> QWidget:
        """Editable paper metadata + figure, in a scroll area."""
        core = QGroupBox("Paper")
        core_form = self._form(core)
        self.f_title = QLineEdit()
        self.f_venue = QLineEdit()
        self.f_date = QLineEdit()
        self.f_date.setPlaceholderText("YYYY-MM-DD")
        self.f_pdf = QLineEdit()
        self.f_authors = QLineEdit()
        self.f_authors.setPlaceholderText("comma-separated")
        self.f_abstract = QPlainTextEdit()
        self.f_abstract.setMaximumHeight(110)
        self.f_tags = QLineEdit()
        self.f_tags.setPlaceholderText("comma-separated")
        self.f_code = QPlainTextEdit()
        self.f_code.setPlaceholderText("one URL per line")
        self.f_code.setMaximumHeight(60)
        core_form.addRow("Title", self.f_title)
        core_form.addRow("Venue", self.f_venue)
        core_form.addRow("Published", self.f_date)
        core_form.addRow("PDF URL", self.f_pdf)
        core_form.addRow("Authors", self.f_authors)
        core_form.addRow("Abstract", self.f_abstract)
        core_form.addRow("Tags", self.f_tags)
        core_form.addRow("Code links", self.f_code)

        self.figure_box = QGroupBox("Figure")
        fig_layout = QVBoxLayout(self.figure_box)
        self.fig_image = QLabel("No figure.")
        self.fig_image.setAlignment(Qt.AlignCenter)
        self.fig_image.setMaximumHeight(200)
        self.fig_image.setStyleSheet("color:#888;")
        fig_form = self._form()
        self.fig_label = QLineEdit()
        self.fig_page = QSpinBox()
        self.fig_page.setRange(0, 999)
        self.fig_cap_en = QLineEdit()
        self.fig_cap_zh = QLineEdit()
        fig_form.addRow("Label", self.fig_label)
        fig_form.addRow("Page", self.fig_page)
        fig_form.addRow("Caption EN", self.fig_cap_en)
        fig_form.addRow("Caption 中文", self.fig_cap_zh)
        view_full = QPushButton("View full")
        view_full.clicked.connect(self._view_figure)
        fig_layout.addWidget(self.fig_image)
        fig_layout.addLayout(fig_form)
        fig_layout.addWidget(view_full, 0, Qt.AlignLeft)

        return self._scroll(core, self.figure_box)

    def _build_eval_tab(self) -> QWidget:
        """Rendered review up top (what you actually read), score/decision editors
        below, and the raw-JSON fields tucked into a collapsible 'Advanced'."""
        lang_row = QHBoxLayout()
        lang_row.addWidget(QLabel("Preview"))
        for loc, label in zip(LOCALES, ("EN", "中文")):
            b = QPushButton(label)
            b.setCheckable(True)
            b.setMaximumWidth(52)
            b.setChecked(loc == self.locale)
            b.clicked.connect(lambda _c, l=loc: self._set_locale(l))
            lang_row.addWidget(b)
        lang_row.addStretch(1)
        self.eval_preview = QTextBrowser()
        self.eval_preview.setOpenExternalLinks(True)
        self.eval_preview.setMinimumHeight(260)

        # Editable scores + decision — the common-case edit.
        self.eval_box = QGroupBox("Scores && decision")
        score_form = self._form(self.eval_box)
        self.score_spins: dict[str, QSpinBox] = {}
        for key, label, mx in _SCORE_DIMS:
            spin = QSpinBox()
            spin.setRange(0, mx)
            spin.valueChanged.connect(self._update_total)
            self.score_spins[key] = spin
            score_form.addRow(f"{label} (/{mx})", spin)
        self.total_label = QLabel("—")
        self.total_label.setStyleSheet("font-weight:600;")
        score_form.addRow("Total", self.total_label)
        self.decision = QComboBox()
        self.decision.addItems(_DECISIONS)
        score_form.addRow("Decision", self.decision)

        # Raw localized fields — power-user editing, collapsed by default.
        adv_inner = QWidget()
        adv_v = QVBoxLayout(adv_inner)
        adv_v.setContentsMargins(0, 6, 0, 0)
        adv_v.setSpacing(3)
        self.eval_json_edits: dict[str, QPlainTextEdit] = {}
        for key, label in _EVAL_JSON_FIELDS:
            adv_v.addWidget(QLabel(label))
            edit = QPlainTextEdit()
            edit.setMaximumHeight(80)
            edit.setStyleSheet("font-family: monospace; font-size: 11px;")
            self.eval_json_edits[key] = edit
            adv_v.addWidget(edit)
        self.eval_advanced = self._collapsible("Advanced — raw fields (JSON)", adv_inner)

        host = QWidget()
        v = QVBoxLayout(host)
        v.setContentsMargins(0, 0, 0, 0)
        v.addLayout(lang_row)
        v.addWidget(self.eval_preview, 1)
        v.addWidget(self.eval_box)
        v.addWidget(self.eval_advanced)
        v.addStretch(0)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setWidget(host)
        return scroll

    # ---------- small layout helpers ----------
    def _form(self, parent: Optional[QWidget] = None) -> QFormLayout:
        """A form whose fields stretch to fill the panel.

        macOS' native style defaults QFormLayout to ``FieldsStayAtSizeHint``,
        which pins every field to a narrow fixed width and wastes the rest of
        the row. Force fields to grow and let long rows wrap on narrow panes.
        """
        form = QFormLayout(parent) if parent is not None else QFormLayout()
        form.setFieldGrowthPolicy(QFormLayout.AllNonFixedFieldsGrow)
        form.setRowWrapPolicy(QFormLayout.WrapLongRows)
        form.setLabelAlignment(Qt.AlignRight | Qt.AlignVCenter)
        form.setHorizontalSpacing(10)
        form.setVerticalSpacing(8)
        return form

    def _scroll(self, *widgets: QWidget) -> QScrollArea:
        host = QWidget()
        v = QVBoxLayout(host)
        v.setContentsMargins(0, 0, 0, 0)
        for w in widgets:
            v.addWidget(w)
        v.addStretch(1)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setWidget(host)
        return scroll

    def _collapsible(self, title: str, inner: QWidget) -> QWidget:
        toggle = QPushButton("▸ " + title)
        toggle.setCheckable(True)
        toggle.setStyleSheet(
            "text-align:left; border:none; color:#1d6fd6; font-weight:600;"
        )
        inner.setVisible(False)

        def _on(checked: bool) -> None:
            inner.setVisible(checked)
            toggle.setText(("▾ " if checked else "▸ ") + title)

        toggle.toggled.connect(_on)
        box = QWidget()
        v = QVBoxLayout(box)
        v.setContentsMargins(0, 0, 0, 0)
        v.setSpacing(2)
        v.addWidget(toggle)
        v.addWidget(inner)
        return box

    @staticmethod
    def _set_line(edit: QLineEdit, text: str) -> None:
        """Set a line edit and scroll it back to the start.

        ``setText`` leaves the cursor at the end, so long values render scrolled
        to their tail (…paper.pdf) instead of their head — reset to column 0.
        """
        edit.setText(text)
        edit.setCursorPosition(0)

    def _hline(self) -> QFrame:
        line = QFrame()
        line.setFrameShape(QFrame.HLine)
        line.setStyleSheet("color:#ddd;")
        return line

    # ---------- list / paging ----------
    def reload_first_page(self) -> None:
        self.page = 1
        self.refresh()

    def refresh(self) -> None:
        try:
            with _busy():
                data = db_live.list_papers(
                    q=self.search.text(),
                    venue=self.venue.text(),
                    year=self.year.text(),
                    sort=self.sort.currentData(),
                    page=self.page,
                    page_size=_PAGE_SIZE,
                )
        except db_live.DbLiveError as e:
            QMessageBox.critical(self, "Live DB", f"Could not list papers:\n{e}")
            return

        self.total_pages = data.get("totalPages", 1)
        self.page = data.get("page", 1)
        total = data.get("total", 0)
        self.results_label.setText(f"{total} paper{'' if total == 1 else 's'}")
        self.page_label.setText(f"page {self.page} / {self.total_pages}")
        self.prev_btn.setEnabled(self.page > 1)
        self.next_btn.setEnabled(self.page < self.total_pages)

        self.table.blockSignals(True)
        self.table.setRowCount(0)
        for row in data.get("papers", []):
            r = self.table.rowCount()
            self.table.insertRow(r)
            counterpart = self._factory_counterpart(row.get("joinKeys", []))
            cells = [
                row.get("title", ""),
                row.get("venue") or "—",
                str(row.get("year") or "—"),
                "—" if row.get("totalScore") is None else str(row["totalScore"]),
                row.get("primarySource", ""),
                counterpart.stage.value if counterpart else "—",
            ]
            for c, text in enumerate(cells):
                item = QTableWidgetItem(text)
                if c == 0:
                    item.setData(Qt.UserRole, row)
                self.table.setItem(r, c, item)
        self.table.blockSignals(False)
        self._clear_detail()
        self._update_selection_actions()

    def _prev_page(self) -> None:
        if self.page > 1:
            self.page -= 1
            self.refresh()

    def _next_page(self) -> None:
        if self.page < self.total_pages:
            self.page += 1
            self.refresh()

    # ---------- detail ----------
    def _selected_row(self) -> Optional[dict[str, Any]]:
        # Detail pane follows the focused (current) row, not the whole selection.
        it = self.table.currentItem()
        if it is None or not it.isSelected():
            return None
        return self.table.item(it.row(), 0).data(Qt.UserRole)

    def _selected_rows(self) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        seen: set[int] = set()
        for it in self.table.selectedItems():
            r = it.row()
            if r in seen:
                continue
            seen.add(r)
            data = self.table.item(r, 0).data(Qt.UserRole)
            if data:
                rows.append(data)
        return rows

    def _update_selection_actions(self) -> None:
        n = len(self._selected_rows())
        self.del_selected_btn.setEnabled(n > 0)
        self.del_selected_btn.setText(
            f"🗑 Delete selected ({n})" if n else "🗑 Delete selected"
        )

    def _on_row_selected(self) -> None:
        row = self._selected_row()
        if not row:
            return
        try:
            with _busy():
                detail = db_live.get_paper(row["id"])
        except db_live.DbLiveError as e:
            QMessageBox.critical(self, "Live DB", f"Could not load paper:\n{e}")
            return
        self.current = detail
        self._populate(detail)

    def _populate(self, d: dict[str, Any]) -> None:
        self._set_detail_enabled(True)
        self.detail_title.setText(d.get("title") or "Untitled")
        self._set_line(self.f_title, d.get("title") or "")
        self._set_line(self.f_venue, d.get("venue") or "")
        self._set_line(self.f_date, d.get("publishedDate") or "")
        self._set_line(self.f_pdf, d.get("pdfUrl") or "")
        self._set_line(self.f_authors, ", ".join(d.get("authors") or []))
        self.f_abstract.setPlainText(d.get("abstract") or "")
        self._set_line(self.f_tags, ", ".join(t["tag"] for t in d.get("tags") or []))
        self.f_code.setPlainText("\n".join(d.get("codeLinks") or []))
        counterpart = self._factory_counterpart(d.get("joinKeys", []))
        self.f_meta.setText(
            f"id {d.get('id')}\nsource {d.get('primarySource')} · "
            f"evals {d.get('evaluationCount', 0)} · "
            f"factory: {counterpart.stage.value if counterpart else 'none'}"
        )

        self._populate_figure(d.get("figure"), d.get("figurePath"))
        self._populate_eval(d.get("evaluation"))
        self._render_preview()

    def _populate_figure(self, figure: Optional[dict[str, Any]], path: Optional[str]) -> None:
        has = figure is not None
        self.figure_box.setVisible(has)
        if not has:
            return
        self._set_line(self.fig_label, figure.get("figureLabel") or "")
        self.fig_page.setValue(int(figure.get("pageNumber") or 0))
        caption = figure.get("caption") or {}
        self._set_line(self.fig_cap_en, caption.get("en", "") if isinstance(caption, dict) else "")
        self._set_line(self.fig_cap_zh, caption.get("zh-TW", "") if isinstance(caption, dict) else "")
        self._fig_path = path
        if path and Path(path).exists():
            pix = QPixmap(path).scaledToHeight(190, Qt.SmoothTransformation)
            self.fig_image.setPixmap(pix)
        else:
            self.fig_image.clear()
            self.fig_image.setText("Figure bytes unavailable.")

    def _populate_eval(self, ev: Optional[dict[str, Any]]) -> None:
        has = ev is not None
        # The preview itself renders a "no evaluation yet" message, so it stays;
        # only the editors are hidden when there is nothing to edit.
        self.eval_box.setVisible(has)
        self.eval_advanced.setVisible(has)
        if not has:
            return
        scores = ev.get("scores") or {}
        for key, spin in self.score_spins.items():
            spin.blockSignals(True)
            spin.setValue(int(scores.get(key) or 0))
            spin.blockSignals(False)
        self._update_total()
        decision = ev.get("recommendationDecision")
        if decision in _DECISIONS:
            self.decision.setCurrentText(decision)
        for key, edit in self.eval_json_edits.items():
            value = ev.get(key)
            edit.setPlainText(
                "" if value is None else json.dumps(value, ensure_ascii=False, indent=2)
            )

    def _update_total(self) -> None:
        total = sum(s.value() for s in self.score_spins.values())
        self.total_label.setText(str(total))

    def _render_preview(self) -> None:
        ev = self.current.get("evaluation") if self.current else None
        self.eval_preview.setHtml(eval_html(ev, self.locale))
        self.eval_preview.verticalScrollBar().setValue(0)

    def _set_locale(self, locale: str) -> None:
        self.locale = locale
        self._render_preview()

    def _view_figure(self) -> None:
        path = getattr(self, "_fig_path", None)
        if not path or not Path(path).exists():
            return
        dlg = QDialog(self)
        dlg.setWindowTitle(self.fig_label.text() or "Figure")
        dlg.resize(900, 700)
        label = QLabel()
        label.setAlignment(Qt.AlignCenter)
        label.setPixmap(QPixmap(path))
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(label)
        layout = QVBoxLayout(dlg)
        layout.addWidget(scroll)
        dlg.exec()

    # ---------- save / delete ----------
    def _save(self) -> None:
        if not self.current:
            return
        pid = self.current["id"]
        patch: dict[str, Any] = {
            "paper": {
                "title": self.f_title.text().strip(),
                "venue": self.f_venue.text().strip(),
                "publishedDate": self.f_date.text().strip() or None,
                "pdfUrl": self.f_pdf.text().strip() or None,
                "abstract": self.f_abstract.toPlainText().strip() or None,
                "authors": [a.strip() for a in self.f_authors.text().split(",") if a.strip()],
            },
            "tags": {"set": [t.strip() for t in self.f_tags.text().split(",") if t.strip()]},
            "codeLinks": {
                "set": [u.strip() for u in self.f_code.toPlainText().splitlines() if u.strip()]
            },
        }

        if self.current.get("figure") is not None:
            patch["figure"] = {
                "figureLabel": self.fig_label.text().strip() or None,
                "pageNumber": self.fig_page.value() or None,
                "caption": {
                    "en": self.fig_cap_en.text().strip(),
                    "zh-TW": self.fig_cap_zh.text().strip(),
                },
            }

        ev = self.current.get("evaluation")
        if ev is not None:
            try:
                eval_patch = self._build_eval_patch(ev)
            except ValueError as e:
                QMessageBox.warning(self, "Invalid JSON", str(e))
                return
            patch["evaluation"] = eval_patch

        try:
            with _busy():
                db_live.update_paper(pid, patch)
        except db_live.DbLiveError as e:
            QMessageBox.critical(self, "Save failed", str(e))
            return
        QMessageBox.information(self, "Saved", "Live DB updated.")
        self.refresh()

    def _build_eval_patch(self, ev: dict[str, Any]) -> dict[str, Any]:
        scores = {key: spin.value() for key, spin in self.score_spins.items()}
        scores["total"] = sum(scores.values())
        patch: dict[str, Any] = {
            "id": ev["id"],
            "scores": scores,
            "recommendationDecision": self.decision.currentText(),
        }
        for key, edit in self.eval_json_edits.items():
            raw = edit.toPlainText().strip()
            if not raw:
                patch[key] = None
                continue
            try:
                patch[key] = json.loads(raw)
            except json.JSONDecodeError as e:
                raise ValueError(f"{key}: {e}") from e
        return patch

    def _delete(self) -> None:
        """Delete the single paper shown in the detail pane."""
        if not self.current:
            return
        self._delete_rows([self.current])

    def _delete_selected(self) -> None:
        """Delete every paper in the current table selection."""
        rows = self._selected_rows()
        if rows:
            self._delete_rows(rows)

    def _delete_rows(self, rows: list[dict[str, Any]]) -> None:
        n = len(rows)
        counterparts = {
            r["id"]: self._factory_counterpart(r.get("joinKeys", [])) for r in rows
        }
        cp_count = sum(1 for cp in counterparts.values() if cp)

        if n == 1:
            title = rows[0].get("title", rows[0]["id"])
            cp = counterparts[rows[0]["id"]]
            extra = (
                f"\n\nThe factory copy (stage {cp.stage.value}) will be reset to REVIEWED."
                if cp
                else ""
            )
            prompt = f"Permanently delete this paper from the live database?\n\n{title}{extra}"
        else:
            preview = "\n".join(f"• {r.get('title', r['id'])}" for r in rows[:10])
            if n > 10:
                preview += f"\n…and {n - 10} more"
            extra = (
                f"\n\n{cp_count} factory copy(ies) will be reset to REVIEWED."
                if cp_count
                else ""
            )
            prompt = (
                f"Permanently delete {n} papers from the live database?\n\n{preview}{extra}"
            )

        if (
            QMessageBox.question(self, "Delete from live DB", prompt)
            != QMessageBox.Yes
        ):
            return

        deleted = 0
        failures: list[str] = []
        with _busy():
            for r in rows:
                pid = r["id"]
                try:
                    db_live.delete_paper(pid)
                except db_live.DbLiveError as e:
                    failures.append(f"{r.get('title', pid)}: {e}")
                    continue
                deleted += 1
                cp = counterparts[pid]
                if cp:
                    self.store.update_fields(cp.id, stage=Stage.REVIEWED, ingested_at=None)

        if failures:
            head = f"Deleted {deleted}/{n}. The rest failed:\n\n" + "\n".join(failures)
            QMessageBox.critical(self, "Delete failed", head)
        else:
            QMessageBox.information(
                self, "Deleted", f"Removed {deleted} paper(s) from live DB."
            )
        self.current = None
        self.refresh()

    # ---------- helpers ----------
    def _factory_counterpart(self, join_keys: list[dict[str, Any]]):
        for jk in join_keys:
            spid = jk.get("sourcePaperId")
            if not spid:
                continue
            paper = self.store.get_paper(f"{jk['source']}:{spid}")
            if paper:
                return paper
        return None

    def _clear_detail(self) -> None:
        self.current = None
        self._set_detail_enabled(False)
        self.detail_title.setText("Select a paper")
        self.f_title.clear()
        self.f_meta.clear()

    def _set_detail_enabled(self, on: bool) -> None:
        self.detail.setEnabled(on)


class _busy:
    """Context manager that shows a wait cursor around a blocking subprocess call."""

    def __enter__(self) -> "_busy":
        QApplication.setOverrideCursor(Qt.WaitCursor)
        QApplication.processEvents()
        return self

    def __exit__(self, *exc: object) -> None:
        QApplication.restoreOverrideCursor()

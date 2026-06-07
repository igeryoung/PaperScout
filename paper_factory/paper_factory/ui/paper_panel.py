"""Right-hand panel: paper metadata, the PDF workspace, the cropped-figure preview,
and the eval review controls."""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import Qt, Signal
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (
    QButtonGroup,
    QDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QScrollArea,
    QTextBrowser,
    QVBoxLayout,
    QWidget,
)

from .. import config, pdf as pdfops
from ..db import Store
from ..models import Paper, ReviewDecision, Stage
from .eval_render import LOCALES, eval_html
from .pdf_view import CropDialog


class PaperPanel(QWidget):
    """Workspace for a single paper. Emits :attr:`changed` after any state mutation."""

    changed = Signal()

    def __init__(self, store: Store) -> None:
        super().__init__()
        self.store = store
        self.paper: Optional[Paper] = None
        self.locale = LOCALES[0]  # "en"; toggled by the language switcher

        self.title = QLabel("Select a paper")
        self.title.setWordWrap(True)
        self.title.setStyleSheet("font-weight: 600; font-size: 14px;")
        self.meta = QLabel("")
        self.meta.setWordWrap(True)
        self.meta.setStyleSheet("color: #555;")

        # One button that downloads the PDF, then turns into the preview launcher.
        self.pdf_btn = QPushButton("Download PDF")
        self.pdf_btn.clicked.connect(self._on_pdf_btn)
        actions = QHBoxLayout()
        actions.addWidget(self.pdf_btn)
        actions.addStretch(1)

        # Cropped-figure preview group
        self.figure_preview = QLabel("No figure cropped yet.")
        self.figure_preview.setAlignment(Qt.AlignCenter)
        self.figure_preview.setMaximumHeight(180)
        self.figure_preview.setStyleSheet("color: #888;")
        self.view_fig_btn = QPushButton("View full")
        self.delete_fig_btn = QPushButton("🗑 Delete crop")
        self.view_fig_btn.clicked.connect(self._view_figure)
        self.delete_fig_btn.clicked.connect(self._delete_crop)
        fig_btns = QHBoxLayout()
        fig_btns.addWidget(self.view_fig_btn)
        fig_btns.addWidget(self.delete_fig_btn)
        fig_btns.addStretch(1)
        figure_box = QGroupBox("Cropped figure")
        fb = QVBoxLayout(figure_box)
        fb.addWidget(self.figure_preview)
        fb.addLayout(fig_btns)

        # Review group — full LLM evaluation, scrollable, with a language switcher.
        self.eval_text = QTextBrowser()
        self.eval_text.setOpenExternalLinks(True)
        self.lang_group = QButtonGroup(self)
        self.lang_group.setExclusive(True)
        lang_row = QHBoxLayout()
        lang_row.addWidget(QLabel("Language"))
        for loc, label in zip(LOCALES, ("EN", "中文")):
            btn = QPushButton(label)
            btn.setCheckable(True)
            btn.setMaximumWidth(56)
            btn.setChecked(loc == self.locale)
            btn.clicked.connect(lambda _checked, l=loc: self._set_locale(l))
            self.lang_group.addButton(btn)
            lang_row.addWidget(btn)
        lang_row.addStretch(1)

        self.pass_btn = QPushButton("✓ Pass")
        self.reject_btn = QPushButton("✗ Reject")
        self.pass_btn.clicked.connect(lambda: self._review(ReviewDecision.PASS))
        self.reject_btn.clicked.connect(lambda: self._review(ReviewDecision.REJECT))
        review_btns = QHBoxLayout()
        review_btns.addWidget(self.pass_btn)
        review_btns.addWidget(self.reject_btn)
        review_btns.addStretch(1)

        review_box = QGroupBox("LLM evaluation")
        rb = QVBoxLayout(review_box)
        rb.addLayout(lang_row)
        rb.addWidget(self.eval_text, 1)
        rb.addLayout(review_btns)

        layout = QVBoxLayout(self)
        layout.addWidget(self.title)
        layout.addWidget(self.meta)
        layout.addLayout(actions)
        layout.addWidget(figure_box)
        layout.addWidget(review_box, 1)
        self._set_enabled(False)

    # ---------- public ----------
    def show_paper(self, paper: Optional[Paper]) -> None:
        self.paper = paper
        if paper is None:
            self.title.setText("Select a paper")
            self.meta.setText("")
            self.eval_text.clear()
            self._render_figure(None)
            self._update_pdf_btn(None)
            self._set_enabled(False)
            return
        self._set_enabled(True)
        self.title.setText(paper.title)
        self.meta.setText(
            f"{paper.venue or '—'} · {', '.join(paper.authors[:4])}"
            f"{' et al.' if len(paper.authors) > 4 else ''}\n"
            f"stage: {paper.stage.value}  ·  bucket: {paper.bucket.value}"
            f"  ·  review: {paper.review_decision.value if paper.review_decision else '—'}"
            + (f"  ·  ⚠ failed at {paper.failed_step}" if paper.failed_step else "")
        )
        self._update_pdf_btn(paper)
        self._render_figure(paper)
        self._render_eval(paper)

    # ---------- actions ----------
    def _download(self) -> None:
        p = self.paper
        if not p or not p.pdf_url:
            QMessageBox.warning(self, "No PDF URL", "This paper has no pdfUrl.")
            return
        dest = config.PDF_DIR / f"{pdfops.safe_id(p.id)}.pdf"
        try:
            pdfops.download_pdf(p.pdf_url, dest)
        except Exception as e:  # noqa: BLE001 — surface to user, flag the step
            self.store.update_fields(p.id, failed_step="download")
            QMessageBox.critical(self, "Download failed", str(e))
            self._reload()
            return
        fields = {"pdf_path": str(dest), "failed_step": None}
        if p.stage.order < Stage.DOWNLOADED.order:
            fields["stage"] = Stage.DOWNLOADED
        self.store.update_fields(p.id, **fields)
        self._reload()

    def _truncate(self, cut_page: int) -> None:
        p = self.paper
        if not p or not p.pdf_path:
            return
        dest = config.TRUNCATED_DIR / f"{pdfops.safe_id(p.id)}-main.pdf"
        try:
            pdfops.truncate_pdf(Path(p.pdf_path), dest, cut_page=cut_page)
        except Exception as e:  # noqa: BLE001
            self.store.update_fields(p.id, failed_step="truncate")
            QMessageBox.critical(self, "Truncate failed", str(e))
            return
        fields = {"truncated_pdf_path": str(dest), "truncate_page": cut_page, "failed_step": None}
        if p.stage.order < Stage.TRUNCATED.order:
            fields["stage"] = Stage.TRUNCATED
        self.store.update_fields(p.id, **fields)
        QMessageBox.information(self, "Truncated", f"Kept pages 1–{cut_page - 1} → {dest.name}")
        self._reload()

    def _crop(self, page_index: int, rect_points: tuple) -> None:
        p = self.paper
        if not p:
            return
        src = Path(p.truncated_pdf_path or p.pdf_path)
        dest = config.FIGURE_DIR / f"{pdfops.safe_id(p.id)}.png"
        try:
            pdfops.crop_figure(src, page_index, rect_points, dest)
        except Exception as e:  # noqa: BLE001
            self.store.update_fields(p.id, failed_step="crop")
            QMessageBox.critical(self, "Crop failed", str(e))
            return
        fields = {
            "figure_path": str(dest),
            "figure_label": f"Figure (p.{page_index + 1})",
            "figure_page": page_index + 1,
            "failed_step": None,
        }
        if p.stage.order < Stage.CROPPED.order:
            fields["stage"] = Stage.CROPPED
        self.store.update_fields(p.id, **fields)
        self._reload()

    def _view_figure(self) -> None:
        p = self.paper
        if not p or not p.figure_path or not Path(p.figure_path).exists():
            return
        dlg = QDialog(self)
        dlg.setWindowTitle(p.figure_label or "Cropped figure")
        dlg.resize(900, 700)
        label = QLabel()
        label.setAlignment(Qt.AlignCenter)
        label.setPixmap(QPixmap(p.figure_path))
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setWidget(label)
        layout = QVBoxLayout(dlg)
        layout.addWidget(scroll)
        dlg.exec()

    def _delete_crop(self) -> None:
        p = self.paper
        if not p or not p.figure_path:
            return
        if QMessageBox.question(
            self, "Delete crop", "Delete the cropped figure for this paper?"
        ) != QMessageBox.Yes:
            return
        try:
            Path(p.figure_path).unlink(missing_ok=True)
        except OSError:
            pass  # file already gone — clearing the DB record is what matters
        fields = {
            "figure_path": None,
            "figure_label": None,
            "figure_page": None,
            "figure_caption_en": None,
            "figure_caption_zh": None,
        }
        if p.stage is Stage.CROPPED:
            fields["stage"] = Stage.TRUNCATED if p.truncated_pdf_path else Stage.DOWNLOADED
        self.store.update_fields(p.id, **fields)
        self._reload()

    def _review(self, decision: ReviewDecision) -> None:
        p = self.paper
        if not p:
            return
        if p.evaluation_json is None:
            QMessageBox.warning(self, "Not evaluated", "Import eval results before reviewing.")
            return
        self.store.update_fields(p.id, review_decision=decision, stage=Stage.REVIEWED, failed_step=None)
        self._reload()

    # ---------- helpers ----------
    def _render_figure(self, paper: Optional[Paper]) -> None:
        has = bool(paper and paper.figure_path and Path(paper.figure_path).exists())
        self.view_fig_btn.setEnabled(has)
        self.delete_fig_btn.setEnabled(has)
        if has:
            pix = QPixmap(paper.figure_path).scaledToHeight(170, Qt.SmoothTransformation)
            self.figure_preview.setPixmap(pix)
            self.figure_preview.setToolTip(paper.figure_label or "Figure")
        else:
            self.figure_preview.clear()
            self.figure_preview.setText("No figure cropped yet.")
            self.figure_preview.setToolTip("")

    def _set_locale(self, locale: str) -> None:
        if locale == self.locale:
            return
        self.locale = locale
        if self.paper:
            self._render_eval(self.paper)

    def _render_eval(self, paper: Paper) -> None:
        self.eval_text.setHtml(eval_html(paper.evaluation_json, self.locale))
        self.eval_text.verticalScrollBar().setValue(0)

    def _pdf_to_show(self, paper: Optional[Paper]) -> Optional[Path]:
        candidate = paper and (paper.truncated_pdf_path or paper.pdf_path)
        return Path(candidate) if candidate and Path(candidate).exists() else None

    def _update_pdf_btn(self, paper: Optional[Paper]) -> None:
        """Download PDF when none is present yet; otherwise launch the preview."""
        self.pdf_btn.setText("Preview / Crop" if self._pdf_to_show(paper) else "Download PDF")

    def _on_pdf_btn(self) -> None:
        if self._pdf_to_show(self.paper):
            self._open_preview()
        else:
            self._download()

    def _open_preview(self) -> None:
        pdf = self._pdf_to_show(self.paper)
        if pdf is None:
            return
        dlg = CropDialog(pdf, 0, self)
        dlg.truncate_requested.connect(self._truncate)
        dlg.crop_requested.connect(self._crop)
        dlg.exec()

    def _set_enabled(self, on: bool) -> None:
        for w in (self.pdf_btn, self.pass_btn, self.reject_btn):
            w.setEnabled(on)

    def _reload(self) -> None:
        if self.paper:
            self.paper = self.store.get_paper(self.paper.id)
            self.show_paper(self.paper)
        self.changed.emit()

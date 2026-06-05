"""PDF viewer widget + modal figure-crop dialog.

The inline viewer handles page navigation and truncation only. Cropping a figure
happens in a dedicated popup (:class:`CropDialog`) opened by *double-clicking* the
page you want: drag a rubber-band selection, then explicitly **Confirm** — nothing
is cropped until you confirm, so an accidental drag never fires a crop.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import (
    QDialog,
    QDialogButtonBox,
    QGraphicsPixmapItem,
    QGraphicsRectItem,
    QGraphicsScene,
    QGraphicsView,
    QHBoxLayout,
    QLabel,
    QMessageBox,
    QPushButton,
    QVBoxLayout,
    QWidget,
)

from .. import pdf as pdfops


class _CropScene(QGraphicsScene):
    """Scene that draws a rubber-band rect on drag and remembers the last selection.

    Unlike a fire-on-release scene it never acts on its own: the dialog reads
    :attr:`last_rect` only when the user confirms.
    """

    def __init__(self) -> None:
        super().__init__()
        self._origin: Optional[QPointF] = None
        self._rect_item: Optional[QGraphicsRectItem] = None
        self.last_rect: Optional[QRectF] = None

    def mousePressEvent(self, event):  # noqa: N802 (Qt naming)
        if event.button() == Qt.LeftButton:
            self._origin = event.scenePos()
            if self._rect_item:
                self.removeItem(self._rect_item)
            self._rect_item = self.addRect(QRectF(self._origin, self._origin))
            pen = self._rect_item.pen()
            pen.setColor(Qt.red)
            pen.setWidth(2)
            self._rect_item.setPen(pen)
        super().mousePressEvent(event)

    def mouseMoveEvent(self, event):  # noqa: N802
        if self._origin and self._rect_item:
            self._rect_item.setRect(QRectF(self._origin, event.scenePos()).normalized())
        super().mouseMoveEvent(event)

    def mouseReleaseEvent(self, event):  # noqa: N802
        if self._origin and self._rect_item:
            rect = self._rect_item.rect()
            self.last_rect = rect if rect.width() > 4 and rect.height() > 4 else None
            self._origin = None
        super().mouseReleaseEvent(event)


class CropDialog(QDialog):
    """Modal figure-crop window for a single page.

    Renders one page at :attr:`ZOOM`, lets the user rubber-band a region, and only
    on **Confirm** exposes :attr:`rect_points` (PDF points: x0, y0, x1, y1).
    """

    ZOOM = 2.0  # high zoom so the confirmed clip re-renders crisply

    def __init__(self, pdf_path: Path, page_index: int, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setWindowTitle(f"Crop figure — page {page_index + 1}")
        self.setModal(True)
        self.resize(760, 920)
        self.rect_points: Optional[tuple[float, float, float, float]] = None

        self.scene = _CropScene()
        self.view = QGraphicsView(self.scene)
        png = pdfops.render_page_png(pdf_path, page_index, zoom=self.ZOOM)
        image = QImage.fromData(png, "PNG")
        self.scene.addItem(QGraphicsPixmapItem(QPixmap.fromImage(image)))
        self.scene.setSceneRect(QRectF(image.rect()))

        hint = QLabel("Drag to select the figure, then click “Confirm crop”.")
        hint.setStyleSheet("color: #666;")

        buttons = QDialogButtonBox()
        buttons.addButton("Confirm crop", QDialogButtonBox.AcceptRole)
        buttons.addButton(QDialogButtonBox.Cancel)
        buttons.accepted.connect(self._on_confirm)
        buttons.rejected.connect(self.reject)

        layout = QVBoxLayout(self)
        layout.addWidget(self.view, 1)
        layout.addWidget(hint)
        layout.addWidget(buttons)

    def _on_confirm(self) -> None:
        rect = self.scene.last_rect
        if rect is None:
            QMessageBox.information(self, "No selection", "Drag a rectangle over the figure first.")
            return
        # scene coords are rendered pixels at self.ZOOM; convert back to PDF points.
        self.rect_points = (
            rect.left() / self.ZOOM,
            rect.top() / self.ZOOM,
            rect.right() / self.ZOOM,
            rect.bottom() / self.ZOOM,
        )
        self.accept()


class _PageView(QGraphicsView):
    """Display-only page view that emits :attr:`double_clicked` to launch the crop dialog."""

    double_clicked = Signal()

    def mouseDoubleClickEvent(self, event):  # noqa: N802
        self.double_clicked.emit()
        super().mouseDoubleClickEvent(event)


class PdfView(QWidget):
    """Self-contained PDF viewer + truncate toolbar.

    Emits :attr:`truncate_requested` (1-based page to cut at) and, after the user
    confirms the modal crop, :attr:`crop_requested` (page_index, rect_points).
    """

    truncate_requested = Signal(int)
    crop_requested = Signal(int, tuple)

    ZOOM = 1.5  # render zoom for display

    def __init__(self) -> None:
        super().__init__()
        self._pdf_path: Optional[Path] = None
        self._page = 0
        self._n_pages = 0

        self.scene = QGraphicsScene()
        self.view = _PageView(self.scene)
        self.view.setDragMode(QGraphicsView.NoDrag)
        self.view.double_clicked.connect(self._open_crop_dialog)

        self.prev_btn = QPushButton("◀ Prev")
        self.next_btn = QPushButton("Next ▶")
        self.page_label = QLabel("— / —")
        self.prev_btn.clicked.connect(lambda: self.show_page(self._page - 1))
        self.next_btn.clicked.connect(lambda: self.show_page(self._page + 1))

        self.cut_btn = QPushButton("Cut here (drop this page onward)")
        self.cut_btn.clicked.connect(self._on_cut)
        self.cut_btn.setToolTip("Truncate the PDF: keep pages before the current one.")

        self.hint = QLabel("Double-click the page to crop a figure.")
        self.hint.setStyleSheet("color: #666;")

        nav = QHBoxLayout()
        nav.addWidget(self.prev_btn)
        nav.addWidget(self.page_label)
        nav.addWidget(self.next_btn)
        nav.addStretch(1)
        nav.addWidget(self.cut_btn)

        layout = QVBoxLayout(self)
        layout.addLayout(nav)
        layout.addWidget(self.view, 1)
        layout.addWidget(self.hint)

    def load(self, pdf_path: Path) -> None:
        self._pdf_path = Path(pdf_path)
        self._n_pages = pdfops.page_count(self._pdf_path)
        self.show_page(0)

    def clear(self) -> None:
        self._pdf_path = None
        self._n_pages = 0
        self.scene.clear()
        self.page_label.setText("— / —")

    def show_page(self, index: int) -> None:
        if not self._pdf_path or self._n_pages == 0:
            return
        index = max(0, min(index, self._n_pages - 1))
        self._page = index
        png = pdfops.render_page_png(self._pdf_path, index, zoom=self.ZOOM)
        image = QImage.fromData(png, "PNG")
        self.scene.clear()
        self.scene.addItem(QGraphicsPixmapItem(QPixmap.fromImage(image)))
        self.scene.setSceneRect(QRectF(image.rect()))
        self.page_label.setText(f"{index + 1} / {self._n_pages}")

    def _on_cut(self) -> None:
        # current page is 0-based; truncate_page is the 1-based first page to drop.
        self.truncate_requested.emit(self._page + 1)

    def _open_crop_dialog(self) -> None:
        if not self._pdf_path or self._n_pages == 0:
            return
        dlg = CropDialog(self._pdf_path, self._page, self)
        if dlg.exec() and dlg.rect_points:
            self.crop_requested.emit(self._page, dlg.rect_points)

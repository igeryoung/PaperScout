"""PDF viewer widget: page nav, zoom, truncation marker, rubber-band figure crop.

Renders pages with :mod:`paper_factory.pdf` (PyMuPDF -> PNG bytes) into a
``QGraphicsView``. The crop rubber-band reports its selection back in PDF points so
:func:`paper_factory.pdf.crop_figure` can re-render the clip at high zoom.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import QPointF, QRectF, Qt, Signal
from PySide6.QtGui import QImage, QPixmap
from PySide6.QtWidgets import (
    QGraphicsPixmapItem,
    QGraphicsRectItem,
    QGraphicsScene,
    QGraphicsView,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from .. import pdf as pdfops


class _CropScene(QGraphicsScene):
    """Scene that draws a rubber-band rect on drag and emits the final rect (scene coords)."""

    crop_made = Signal(QRectF)

    def __init__(self) -> None:
        super().__init__()
        self._origin: Optional[QPointF] = None
        self._rect_item: Optional[QGraphicsRectItem] = None

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
            if rect.width() > 4 and rect.height() > 4:
                self.crop_made.emit(rect)
            self._origin = None
        super().mouseReleaseEvent(event)


class PdfView(QWidget):
    """Self-contained PDF viewer + truncate/crop toolbar.

    Emits :attr:`truncate_requested` (1-based page to cut at) and
    :attr:`crop_requested` (page_index, rect_points) for the parent to persist.
    """

    truncate_requested = Signal(int)
    crop_requested = Signal(int, tuple)

    ZOOM = 1.5  # render zoom for display

    def __init__(self) -> None:
        super().__init__()
        self._pdf_path: Optional[Path] = None
        self._page = 0
        self._n_pages = 0

        self.scene = _CropScene()
        self.scene.crop_made.connect(self._on_crop)
        self.view = QGraphicsView(self.scene)
        self.view.setDragMode(QGraphicsView.NoDrag)

        self.prev_btn = QPushButton("◀ Prev")
        self.next_btn = QPushButton("Next ▶")
        self.page_label = QLabel("— / —")
        self.prev_btn.clicked.connect(lambda: self.show_page(self._page - 1))
        self.next_btn.clicked.connect(lambda: self.show_page(self._page + 1))

        self.cut_btn = QPushButton("Cut here (drop this page onward)")
        self.cut_btn.clicked.connect(self._on_cut)
        self.cut_btn.setToolTip("Truncate the PDF: keep pages before the current one.")

        self.hint = QLabel("Drag on the page to crop a figure.")
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

    def _on_crop(self, scene_rect: QRectF) -> None:
        if not self._pdf_path:
            return
        # scene coords are rendered pixels at self.ZOOM; convert back to PDF points.
        x0 = scene_rect.left() / self.ZOOM
        y0 = scene_rect.top() / self.ZOOM
        x1 = scene_rect.right() / self.ZOOM
        y1 = scene_rect.bottom() / self.ZOOM
        self.crop_requested.emit(self._page, (x0, y0, x1, y1))

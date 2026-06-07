"""Modal PDF preview/crop dialog.

:class:`CropDialog` is the full preview workspace, launched from the paper panel
once a PDF has been downloaded:

* change page and truncate from inside the preview,
* open at *fit-the-page* size with zoom in / out (also Ctrl + mouse-wheel),
* draw a crop box, then **grab its four corner handles** to refine the region
  before committing — nothing is cropped until you click *Confirm crop*.
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import QPointF, QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QBrush, QColor, QImage, QPen, QPixmap
from PySide6.QtWidgets import (
    QDialog,
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

# Corner identifiers for the crop handles.
_TL, _TR, _BL, _BR = range(4)


class _CropScene(QGraphicsScene):
    """Scene that owns a single, editable crop rectangle.

    Drawing works in three gestures, all in *scene* (rendered-pixel) coordinates so
    they are independent of the view's zoom:

    * drag on empty space → rubber-band a fresh rectangle,
    * drag a corner handle → resize from that corner (opposite corner pinned),
    * drag inside the rectangle → move the whole selection.

    The committed selection is exposed as :attr:`rect`; the dialog converts it to
    PDF points only on confirm.
    """

    HANDLE_PX = 9  # on-screen handle size, kept constant across zoom levels

    def __init__(self) -> None:
        super().__init__()
        self.rect: Optional[QRectF] = None
        self._bounds = QRectF()  # the rendered page, used to clamp the selection
        self._rect_item: Optional[QGraphicsRectItem] = None
        self._handles: list[QGraphicsRectItem] = []
        self._mode: Optional[str] = None  # "new" | "move" | "resize"
        self._corner: Optional[int] = None
        self._origin = QPointF()
        self._press_pos = QPointF()
        self._rect_at_press = QRectF()

    # ---------- setup ----------
    def set_bounds(self, rect: QRectF) -> None:
        self._bounds = QRectF(rect)

    def clear_selection(self) -> None:
        self.rect = None
        if self._rect_item:
            self.removeItem(self._rect_item)
            self._rect_item = None
        for h in self._handles:
            self.removeItem(h)
        self._handles = []

    # ---------- geometry helpers ----------
    def _view_scale(self) -> float:
        views = self.views()
        return views[0].transform().m11() if views else 1.0

    def _handle_size(self) -> float:
        return self.HANDLE_PX / max(self._view_scale(), 0.01)

    def _clamp_point(self, p: QPointF) -> QPointF:
        if self._bounds.isNull():
            return p
        x = min(max(p.x(), self._bounds.left()), self._bounds.right())
        y = min(max(p.y(), self._bounds.top()), self._bounds.bottom())
        return QPointF(x, y)

    def _corners(self) -> dict[int, QPointF]:
        r = self.rect
        return {
            _TL: r.topLeft(),
            _TR: r.topRight(),
            _BL: r.bottomLeft(),
            _BR: r.bottomRight(),
        }

    def _handle_at(self, pos: QPointF) -> Optional[int]:
        if self.rect is None:
            return None
        tol = self._handle_size()  # generous grab radius
        for corner, c in self._corners().items():
            if abs(pos.x() - c.x()) <= tol and abs(pos.y() - c.y()) <= tol:
                return corner
        return None

    # ---------- rendering ----------
    def update_items(self) -> None:
        """(Re)draw the selection rectangle and its corner handles."""
        if self.rect is None:
            return
        if self._rect_item is None:
            pen = QPen(QColor("#e23b3b"))
            pen.setWidth(2)
            pen.setCosmetic(True)  # constant width regardless of zoom
            self._rect_item = self.addRect(self.rect, pen, QBrush(QColor(226, 59, 59, 32)))
            self._rect_item.setZValue(10)
        else:
            self._rect_item.setRect(self.rect)

        if not self._handles:
            hpen = QPen(QColor("#e23b3b"))
            hpen.setCosmetic(True)
            hbrush = QBrush(QColor("white"))
            for _ in range(4):
                h = self.addRect(QRectF(), hpen, hbrush)
                h.setZValue(11)
                self._handles.append(h)

        s = self._handle_size()
        for h, c in zip(self._handles, self._corners().values()):
            h.setRect(QRectF(c.x() - s / 2, c.y() - s / 2, s, s))

    # ---------- interaction ----------
    def mousePressEvent(self, event):  # noqa: N802 (Qt naming)
        if event.button() != Qt.LeftButton:
            super().mousePressEvent(event)
            return
        pos = self._clamp_point(event.scenePos())
        corner = self._handle_at(pos)
        if corner is not None:
            self._mode, self._corner = "resize", corner
        elif self.rect is not None and self.rect.contains(pos):
            self._mode = "move"
            self._press_pos = pos
            self._rect_at_press = QRectF(self.rect)
        else:
            self._mode = "new"
            self._origin = pos
            self.rect = QRectF(pos, pos)
            self.update_items()

    def mouseMoveEvent(self, event):  # noqa: N802
        if self._mode is None:
            super().mouseMoveEvent(event)
            return
        pos = self._clamp_point(event.scenePos())
        if self._mode == "new":
            self.rect = QRectF(self._origin, pos).normalized()
        elif self._mode == "move":
            r = QRectF(self._rect_at_press)
            r.translate(pos - self._press_pos)
            self.rect = self._clamp_rect(r)
        elif self._mode == "resize":
            self.rect = self._resize_to(pos)
        self.update_items()

    def mouseReleaseEvent(self, event):  # noqa: N802
        if self._mode is not None:
            if self.rect is not None:
                r = self.rect.normalized()
                # discard accidental clicks that never became a real box
                self.rect = r if r.width() > 4 and r.height() > 4 else None
                if self.rect is None:
                    self.clear_selection()
                else:
                    self.update_items()
            self._mode = self._corner = None
        super().mouseReleaseEvent(event)

    def _clamp_rect(self, r: QRectF) -> QRectF:
        if self._bounds.isNull():
            return r
        dx = max(0.0, self._bounds.left() - r.left()) - max(0.0, r.right() - self._bounds.right())
        dy = max(0.0, self._bounds.top() - r.top()) - max(0.0, r.bottom() - self._bounds.bottom())
        r.translate(dx, dy)
        return r

    def _resize_to(self, pos: QPointF) -> QRectF:
        r = self.rect
        x0, y0, x1, y1 = r.left(), r.top(), r.right(), r.bottom()
        if self._corner == _TL:
            x0, y0 = pos.x(), pos.y()
        elif self._corner == _TR:
            x1, y0 = pos.x(), pos.y()
        elif self._corner == _BL:
            x0, y1 = pos.x(), pos.y()
        elif self._corner == _BR:
            x1, y1 = pos.x(), pos.y()
        return QRectF(QPointF(x0, y0), QPointF(x1, y1)).normalized()


class _PreviewView(QGraphicsView):
    """Graphics view with Ctrl+wheel zoom that emits a double-click to start cropping."""

    double_clicked = Signal()

    def __init__(self, scene: QGraphicsScene) -> None:
        super().__init__(scene)
        self.setRenderHints(self.renderHints())
        self.setDragMode(QGraphicsView.NoDrag)
        self.setTransformationAnchor(QGraphicsView.AnchorUnderMouse)
        self._scale = 1.0

    def wheelEvent(self, event):  # noqa: N802
        if event.modifiers() & Qt.ControlModifier:
            self.zoom_by(1.15 if event.angleDelta().y() > 0 else 1 / 1.15)
            event.accept()
        else:
            super().wheelEvent(event)

    def mouseDoubleClickEvent(self, event):  # noqa: N802
        self.double_clicked.emit()
        super().mouseDoubleClickEvent(event)

    def zoom_by(self, factor: float) -> None:
        self._scale *= factor
        self.scale(factor, factor)
        self._refresh_handles()

    def set_scale(self, scale: float) -> None:
        factor = scale / max(self._scale, 0.01)
        self.zoom_by(factor)

    def fit(self) -> None:
        if self.scene() and not self.scene().sceneRect().isNull():
            self.fitInView(self.scene().sceneRect(), Qt.KeepAspectRatio)
            self._scale = self.transform().m11()
            self._refresh_handles()

    def _refresh_handles(self) -> None:
        scene = self.scene()
        if isinstance(scene, _CropScene):
            scene.update_items()


class CropDialog(QDialog):
    """Full preview + crop modal for one PDF, starting on ``page_index``.

    Renders pages at :attr:`RENDER_ZOOM` for a crisp clip and lets the view scale
    freely on top. Emits :attr:`crop_requested` on confirm and
    :attr:`truncate_requested` from the in-preview *Cut here* button (then closes).
    """

    RENDER_ZOOM = 2.0  # pixmap resolution; view zoom is applied on top of this

    truncate_requested = Signal(int)
    crop_requested = Signal(int, tuple)

    def __init__(self, pdf_path: Path, page_index: int, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setModal(True)
        self.resize(1040, 940)
        self._pdf_path = Path(pdf_path)
        self._n_pages = pdfops.page_count(self._pdf_path)
        self._page = max(0, min(page_index, self._n_pages - 1))
        self._pixmap_item: Optional[QGraphicsPixmapItem] = None

        self.scene = _CropScene()
        self.view = _PreviewView(self.scene)
        self.view.double_clicked.connect(self.scene.clear_selection)

        # --- top toolbar: page nav + zoom ---
        self.prev_btn = QPushButton("◀ Prev")
        self.next_btn = QPushButton("Next ▶")
        self.page_label = QLabel("— / —")
        self.prev_btn.clicked.connect(lambda: self._go(self._page - 1))
        self.next_btn.clicked.connect(lambda: self._go(self._page + 1))

        zoom_out = QPushButton("➖")
        zoom_in = QPushButton("➕")
        fit_btn = QPushButton("Fit")
        actual_btn = QPushButton("100%")
        zoom_out.clicked.connect(lambda: self.view.zoom_by(1 / 1.2))
        zoom_in.clicked.connect(lambda: self.view.zoom_by(1.2))
        fit_btn.clicked.connect(self.view.fit)
        # 100% means 1 PDF point == 1 screen pixel: undo the render upscaling.
        actual_btn.clicked.connect(lambda: self.view.set_scale(1 / self.RENDER_ZOOM))

        top = QHBoxLayout()
        top.addWidget(self.prev_btn)
        top.addWidget(self.page_label)
        top.addWidget(self.next_btn)
        top.addStretch(1)
        for w in (zoom_out, zoom_in, fit_btn, actual_btn):
            top.addWidget(w)

        # --- bottom bar: truncate + crop actions ---
        self.cut_btn = QPushButton("Cut here (drop this page onward)")
        self.cut_btn.setToolTip("Truncate the PDF: keep pages before the current one.")
        self.cut_btn.clicked.connect(self._on_cut)
        confirm_btn = QPushButton("Confirm crop")
        cancel_btn = QPushButton("Close")
        confirm_btn.clicked.connect(self._on_confirm)
        cancel_btn.clicked.connect(self.reject)

        bottom = QHBoxLayout()
        bottom.addWidget(self.cut_btn)
        bottom.addStretch(1)
        bottom.addWidget(confirm_btn)
        bottom.addWidget(cancel_btn)

        hint = QLabel(
            "Drag to draw a crop box, then grab the corner handles to refine it. "
            "Ctrl + scroll to zoom."
        )
        hint.setStyleSheet("color: #666;")

        layout = QVBoxLayout(self)
        layout.addLayout(top)
        layout.addWidget(self.view, 1)
        layout.addWidget(hint)
        layout.addLayout(bottom)

        self._render_page()
        # Fit once the viewport has a real size (default "full page" view).
        QTimer.singleShot(0, self.view.fit)

    # ---------- rendering / navigation ----------
    def _render_page(self) -> None:
        png = pdfops.render_page_png(self._pdf_path, self._page, zoom=self.RENDER_ZOOM)
        image = QImage.fromData(png, "PNG")
        pixmap = QPixmap.fromImage(image)
        self.scene.clear_selection()
        if self._pixmap_item is not None:
            self.scene.removeItem(self._pixmap_item)
        self._pixmap_item = QGraphicsPixmapItem(pixmap)
        self._pixmap_item.setTransformationMode(Qt.SmoothTransformation)
        self.scene.addItem(self._pixmap_item)
        bounds = QRectF(pixmap.rect())
        self.scene.setSceneRect(bounds)
        self.scene.set_bounds(bounds)
        self.setWindowTitle(f"Preview & crop — page {self._page + 1} / {self._n_pages}")
        self.page_label.setText(f"{self._page + 1} / {self._n_pages}")
        self.prev_btn.setEnabled(self._page > 0)
        self.next_btn.setEnabled(self._page < self._n_pages - 1)

    def _go(self, index: int) -> None:
        index = max(0, min(index, self._n_pages - 1))
        if index != self._page:
            self._page = index
            self._render_page()

    # ---------- actions ----------
    def _on_cut(self) -> None:
        # current page is 0-based; truncate_page is the 1-based first page to drop.
        self.truncate_requested.emit(self._page + 1)
        self.accept()

    def _on_confirm(self) -> None:
        rect = self.scene.rect
        if rect is None:
            QMessageBox.information(self, "No selection", "Drag a rectangle over the figure first.")
            return
        # scene coords are rendered pixels at RENDER_ZOOM; convert back to PDF points.
        points = (
            rect.left() / self.RENDER_ZOOM,
            rect.top() / self.RENDER_ZOOM,
            rect.right() / self.RENDER_ZOOM,
            rect.bottom() / self.RENDER_ZOOM,
        )
        self.crop_requested.emit(self._page, points)
        self.accept()


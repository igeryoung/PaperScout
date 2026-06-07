"""PyMuPDF (fitz) operations — kept GUI-free so they are unit-testable headless.

The UI converts the PNG bytes from :func:`render_page_png` into a ``QPixmap``; this
module never imports PySide6.
"""

from __future__ import annotations

import urllib.request
from pathlib import Path
from typing import Optional

import fitz  # PyMuPDF

MAX_PDF_BYTES = 32 * 1024 * 1024  # 32 MB cap, mirrors evaluate-papers PROCESSING.md


def download_pdf(url: str, dest: Path, timeout: int = 60) -> Path:
    """Download ``url`` to ``dest`` with a size cap. Raises on HTTP/size error."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "paper-factory/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted URLs)
        data = resp.read(MAX_PDF_BYTES + 1)
    if len(data) > MAX_PDF_BYTES:
        raise ValueError(f"PDF exceeds {MAX_PDF_BYTES} byte cap: {url}")
    dest.write_bytes(data)
    return dest


def page_count(pdf_path: Path) -> int:
    with fitz.open(pdf_path) as doc:
        return doc.page_count


def render_page_png(pdf_path: Path, page_index: int, zoom: float = 1.5) -> bytes:
    """Render one page to PNG bytes at the given zoom (1.0 == 72 dpi)."""
    with fitz.open(pdf_path) as doc:
        page = doc.load_page(page_index)
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        return pix.tobytes("png")


def page_size_points(pdf_path: Path, page_index: int) -> tuple[float, float]:
    with fitz.open(pdf_path) as doc:
        rect = doc.load_page(page_index).rect
        return rect.width, rect.height


def truncate_pdf(src: Path, dest: Path, cut_page: int) -> Path:
    """Write ``dest`` keeping the pages *before* ``cut_page``.

    ``cut_page`` is the 1-based page number where References/Appendix begins, i.e.
    the first page to DROP. We keep pages ``1 .. cut_page-1`` (indices ``0 .. cut_page-2``).
    Always keeps at least the first page.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    with fitz.open(src) as doc:
        last_keep = max(0, min(cut_page - 2, doc.page_count - 1))
        out = fitz.open()
        out.insert_pdf(doc, from_page=0, to_page=last_keep)
        out.save(dest)
        out.close()
    return dest


def crop_figure(
    pdf_path: Path,
    page_index: int,
    rect_points: tuple[float, float, float, float],
    dest: Path,
    zoom: float = 4.0,
) -> Path:
    """Render the clip ``rect_points`` (PDF points: x0,y0,x1,y1) of one page to PNG.

    ``zoom`` is the render scale (1.0 == 72 dpi); 4.0 gives a crisp ~288 dpi crop.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    clip = fitz.Rect(*rect_points)
    with fitz.open(pdf_path) as doc:
        page = doc.load_page(page_index)
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip)
        pix.save(dest)
    return dest


def safe_id(paper_id: str) -> str:
    """Filesystem-safe slug from a paper id like ``OPENREVIEW:u6JLh0BO5h``."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in paper_id)

"""PyMuPDF (fitz) operations — kept GUI-free so they are unit-testable headless.

The UI converts the PNG bytes from :func:`render_page_png` into a ``QPixmap``; this
module never imports PySide6.
"""

from __future__ import annotations

import re
import urllib.request
from pathlib import Path
from typing import Iterable, Optional

import fitz  # PyMuPDF

from . import config

MAX_PDF_BYTES = 128 * 1024 * 1024  # 128 MB cap, mirrors evaluate-papers PROCESSING.md

# owner/repo after github.com — tolerate trailing junk; normalised below.
_GITHUB_RE = re.compile(
    r"(?:https?://)?(?:www\.)?github\.com/([A-Za-z0-9_.\-]+)/([A-Za-z0-9_.\-]+)",
    re.IGNORECASE,
)
# owners that are never a paper's code repo
_GITHUB_NON_REPO_OWNERS = {"features", "topics", "orgs", "sponsors", "about", "site", "settings"}


def _normalize_github(owner: str, repo: str) -> Optional[str]:
    repo = repo.rstrip(".,;:)]}>'\"")
    if repo.endswith(".git"):
        repo = repo[:-4]
    if not repo or owner.lower() in _GITHUB_NON_REPO_OWNERS:
        return None
    return f"https://github.com/{owner}/{repo}"


def extract_github_urls(texts: Iterable[str], pdf_path: Optional[Path] = None) -> list[str]:
    """Collect normalised GitHub repo URLs from free text and (optionally) a PDF.

    Scans the given strings (e.g. the abstract) plus, when ``pdf_path`` is set,
    every page's visible text and embedded link annotations — papers often
    hyperlink the repo behind the word "code". Returns unique
    ``https://github.com/<owner>/<repo>`` URLs in first-seen order.
    """
    chunks = [t for t in texts if t]
    if pdf_path is not None:
        with fitz.open(pdf_path) as doc:
            for page in doc:
                chunks.append(page.get_text())
                for link in page.get_links():
                    uri = link.get("uri")
                    if uri:
                        chunks.append(uri)
    out: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        for m in _GITHUB_RE.finditer(chunk):
            url = _normalize_github(m.group(1), m.group(2))
            if url and url.lower() not in seen:
                seen.add(url.lower())
                out.append(url)
    return out


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


def pdf_dest(paper_id: str, batch_id: Optional[int]) -> Path:
    """Where a paper's PDF lives: its batch folder when assigned, else the shared pool.

    Batch PDFs are named ``<sid>-main.pdf`` from the start; truncation rewrites the
    same file in place, so export never needs a separate copy step.
    """
    sid = safe_id(paper_id)
    if batch_id is not None:
        return config.batch_dir(batch_id) / f"{sid}-main.pdf"
    return config.PDF_DIR / f"{sid}.pdf"


def truncate_pdf(src: Path, dest: Path, cut_page: int) -> Path:
    """Write ``dest`` keeping the pages *before* ``cut_page``.

    ``cut_page`` is the 1-based page number where References/Appendix begins, i.e.
    the first page to DROP. We keep pages ``1 .. cut_page-1`` (indices ``0 .. cut_page-2``).
    Always keeps at least the first page. ``dest`` may equal ``src``: the trimmed
    copy is staged to a temp file and swapped in once the source is closed.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)
    in_place = src.resolve() == dest.resolve()
    target = dest.with_name(dest.name + ".tmp") if in_place else dest
    with fitz.open(src) as doc:
        last_keep = max(0, min(cut_page - 2, doc.page_count - 1))
        out = fitz.open()
        out.insert_pdf(doc, from_page=0, to_page=last_keep)
        out.save(target)
        out.close()
    if in_place:
        target.replace(dest)
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


def search_github_by_title(title: str, timeout: int = 15) -> Optional[str]:
    """One GitHub search API call for ``title``; return the top repo URL or None.

    Only accepts the hit when its description mentions a distinctive chunk of
    the title (case-insensitive), so generic name collisions are dropped.
    Unauthenticated rate limit is 10 req/min — fine for per-download use.
    """
    import json
    import urllib.parse

    q = re.sub(r"[\"':,?–—]", " ", title)
    q = re.sub(r"\s+", " ", q).strip()
    url = (
        "https://api.github.com/search/repositories?per_page=1&q="
        + urllib.parse.quote(q)
    )
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "paper-factory/0.1", "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
    except Exception:  # noqa: BLE001 — offline / rate-limited: just skip
        return None
    items = data.get("items") or []
    if not items:
        return None
    hit = items[0]
    # require a distinctive title fragment in the description to trust the match;
    # normalise both sides identically so punctuation differences don't matter
    desc = re.sub(r"[\"':,?–—\[\]()]", " ", (hit.get("description") or "").lower())
    desc = re.sub(r"\s+", " ", desc)
    fragment = q.lower()[:40].strip()
    if fragment not in desc:
        return None
    return hit["html_url"]


def merge_code_urls(
    existing: list[str], abstract: Optional[str], pdf_path: Path, title: Optional[str] = None
) -> Optional[list[str]]:
    """Merge GitHub repos found in the abstract/PDF into ``existing`` code URLs.

    When the PDF/abstract yield nothing and ``title`` is given, falls back to a
    single GitHub title search. Returns the merged list, or ``None`` when
    nothing new was found (so callers can skip the DB write). Errors are
    swallowed — enrichment must never fail the download step.
    """
    try:
        found = extract_github_urls([abstract or ""], pdf_path)
    except Exception:  # noqa: BLE001 — best-effort enrichment only
        found = []
    if not found and not existing and title:
        hit = search_github_by_title(title)
        if hit:
            found = [hit]
    seen = {u.lower() for u in existing}
    new = [u for u in found if u.lower() not in seen]
    return existing + new if new else None


def safe_id(paper_id: str) -> str:
    """Filesystem-safe slug from a paper id like ``OPENREVIEW:u6JLh0BO5h``."""
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in paper_id)

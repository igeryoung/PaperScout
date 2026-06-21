#!/usr/bin/env python3
"""Resolve canonical metadata for a folder of locally-collected PDFs.

For every ``*.pdf`` in the folder this:
  1. extracts a title (and a rough author) seed from page 1,
  2. searches Semantic Scholar (then arXiv as a fallback) for the canonical paper,
  3. maps the match to a ``CandidateRecord`` (shape: ``src/server/schema/candidate.ts``).

It writes ``<folder>/candidates.json`` — a JSON **array** identical to
``data/sample/candidates.json`` except every record additionally carries:
  * ``pdfFile``     — the PDF's filename in the folder (the GUI pairs records to PDFs by this),
  * ``needsReview`` — ``true`` when no confident online match was found (the agent/user then
                      patches ``sourceUrl`` / ``venue`` / ``publishedDate`` before uploading).

Both extra keys are ignored by the zod schema (non-strict ``z.object`` strips unknown keys),
so the file still passes ``npm run validate:candidates``.

Usage:
    python3 resolve_metadata.py /path/to/folder [--min-score 0.72] [--sleep 1.0] [--limit N]
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Optional

SS_SEARCH = "https://api.semanticscholar.org/graph/v1/paper/search"
SS_FIELDS = "title,authors,year,publicationDate,venue,abstract,externalIds,openAccessPdf"
ARXIV_API = "http://export.arxiv.org/api/query"
ATOM = "{http://www.w3.org/2005/Atom}"
USER_AGENT = "paper-factory-collect/0.1 (mailto:papers@example.com)"

GITHUB_RE = re.compile(r"https?://github\.com/[A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+", re.I)
_GITHUB_BAD_OWNER = {"features", "topics", "orgs", "sponsors", "about", "site", "settings"}


# --------------------------------------------------------------------------- PDF seed

def _page1_via_fitz(pdf: Path) -> Optional[tuple[str, str, Optional[str]]]:
    """Return (title_seed, full_page1_text, pdf_creation_date) using PyMuPDF, or None."""
    try:
        import fitz  # type: ignore
    except Exception:
        return None
    try:
        with fitz.open(pdf) as doc:
            page = doc.load_page(0)
            title = _title_from_page(page)
            full = page.get_text()
            meta_date = _parse_pdf_date(doc.metadata.get("creationDate") if doc.metadata else None)
    except Exception:
        return None
    return _clean(title), full, meta_date


def _title_from_page(page) -> str:
    """Reconstruct the page-1 title, robust to the small-caps title fonts that
    ICLR/NeurIPS templates use.

    Two passes: the ``dict`` pass locates the title's vertical *band* — the
    contiguous run of largest-font lines, below any venue header and above the
    authors. The ``words`` pass then supplies PyMuPDF's correct word
    segmentation for that band, because plain/dict text inserts spurious spaces
    at every font-size change inside a small-caps word (``TRIPLE`` -> ``T RIPLE``,
    ``DO WE REALLY`` -> ``D O W E R EALLY``). Line-wrap hyphens (``OR-`` + ``DER``)
    are stitched back into one word.
    """
    height = page.rect.height or 1.0
    dlines: list[tuple[float, float, float]] = []  # (y_top, y_bottom, max_font_size)
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            sp = [s for s in line.get("spans", []) if s["text"].strip()]
            if sp:
                dlines.append((min(s["bbox"][1] for s in sp),
                               max(s["bbox"][3] for s in sp),
                               max(s["size"] for s in sp)))
    if not dlines:
        return ""
    dlines.sort()
    upper = [dl for dl in dlines if dl[0] <= height * 0.6] or dlines
    max_size = max(sz for *_, sz in upper)
    band: list[tuple[float, float]] = []
    started = False
    for y0, y1, size in dlines:
        if size >= 0.75 * max_size:
            started = True
            band.append((y0, y1))
            if len(band) >= 4:  # titles span a few lines at most; don't run into the body
                break
        elif started:  # first smaller line after the title block = authors/affiliation
            break
    if not band:
        return ""
    ymin, ymax = min(b[0] for b in band) - 2, max(b[1] for b in band) + 2

    rows: dict[tuple[int, int], list] = {}
    for w in page.get_text("words"):  # (x0, y0, x1, y1, word, block_no, line_no, word_no)
        if ymin <= w[1] <= ymax:
            rows.setdefault((w[5], w[6]), []).append(w)
    title = ""
    for key in sorted(rows, key=lambda k: min(w[1] for w in rows[k])):
        seg = " ".join(w[4] for w in sorted(rows[key], key=lambda w: w[7]))
        if not title:
            title = seg
        elif title.endswith("-"):  # de-hyphenate a line-wrapped word
            title = title[:-1] + seg
        else:
            title += " " + seg
    return title


def _page1_via_pdftotext(pdf: Path) -> tuple[str, str, Optional[str]]:
    """Fallback seed: first non-empty lines of page 1 via the ``pdftotext`` CLI."""
    try:
        out = subprocess.run(
            ["pdftotext", "-f", "1", "-l", "1", str(pdf), "-"],
            capture_output=True, text=True, timeout=60,
        ).stdout
    except Exception:
        return "", "", None
    lines = [ln.strip() for ln in out.splitlines() if ln.strip()]
    title = _clean(lines[0]) if lines else ""
    # A wrapped title often spills onto line 2 before the author line; join short heads.
    if len(lines) > 1 and len(lines[0]) < 70 and not _looks_like_authors(lines[1]):
        title = _clean(lines[0] + " " + lines[1])
    return title, out, None


def page1_seed(pdf: Path) -> tuple[str, str, Optional[str]]:
    return _page1_via_fitz(pdf) or _page1_via_pdftotext(pdf)


def guess_authors(full_text: str, title: str) -> list[str]:
    """Rough author seed from page 1 — only used for `needsReview` records (resolved
    papers take authors from the online match)."""
    lines = [ln.strip() for ln in full_text.splitlines() if ln.strip()]
    norm_title = _norm(title)
    for i, ln in enumerate(lines):
        if _norm(ln) and _norm(ln) in norm_title or norm_title in _norm(ln):
            for cand in lines[i + 1 : i + 4]:
                if _looks_like_authors(cand):
                    return _split_authors(cand)
            break
    return ["Unknown"]


# --------------------------------------------------------------------------- search

def _http_json(url: str, retries: int = 3) -> Optional[dict]:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503) and attempt < retries - 1:
                time.sleep(2 ** (attempt + 1))
                continue
            return None
        except Exception:
            return None
    return None


def semantic_scholar(title: str, sleep: float) -> list[dict]:
    if not title:
        return []
    url = f"{SS_SEARCH}?query={urllib.parse.quote(title)}&limit=5&fields={SS_FIELDS}"
    data = _http_json(url)
    time.sleep(sleep)
    return (data or {}).get("data") or []


def arxiv(title: str, sleep: float) -> list[dict]:
    if not title:
        return []
    q = urllib.parse.quote(f'ti:"{title}"')
    url = f"{ARXIV_API}?search_query={q}&start=0&max_results=5"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=30) as resp:
            root = ET.fromstring(resp.read())
    except Exception:
        return []
    finally:
        time.sleep(sleep)
    out = []
    for entry in root.findall(f"{ATOM}entry"):
        abs_url = (entry.findtext(f"{ATOM}id") or "").strip()
        m = re.search(r"arxiv\.org/abs/([0-9]+\.[0-9]+)", abs_url)
        out.append({
            "title": _clean(entry.findtext(f"{ATOM}title") or ""),
            "authors": [a.findtext(f"{ATOM}name") or "" for a in entry.findall(f"{ATOM}author")],
            "abstract": _clean(entry.findtext(f"{ATOM}summary") or ""),
            "published": (entry.findtext(f"{ATOM}published") or "")[:10] or None,
            "arxiv_id": m.group(1) if m else None,
        })
    return out


def best_match(seed_title: str, cands: list[dict]) -> tuple[Optional[dict], float]:
    best, score = None, 0.0
    for c in cands:
        s = difflib.SequenceMatcher(None, _norm(seed_title), _norm(c.get("title", ""))).ratio()
        if s > score:
            best, score = c, s
    return best, score


# --------------------------------------------------------------------------- mapping

def record_from_ss(hit: dict, pdf_file: str) -> dict:
    ext = hit.get("externalIds") or {}
    arxiv_id = ext.get("ArXiv")
    doi = ext.get("DOI")
    authors = [a.get("name") for a in (hit.get("authors") or []) if a.get("name")] or ["Unknown"]
    oa = (hit.get("openAccessPdf") or {}).get("url")

    if arxiv_id:
        source, source_url = "ARXIV", f"https://arxiv.org/abs/{arxiv_id}"
        pdf_url, spid = f"https://arxiv.org/pdf/{arxiv_id}", arxiv_id
    elif doi:
        source, source_url = "OPENACCESS", f"https://doi.org/{doi}"
        pdf_url, spid = oa, doi
    else:
        source = "OPENACCESS"
        source_url = oa or f"https://www.semanticscholar.org/paper/{hit.get('paperId', '')}"
        pdf_url, spid = oa, hit.get("paperId")

    return _record(
        title=_clean(hit.get("title") or ""),
        authors=authors,
        abstract=hit.get("abstract"),
        venue=(hit.get("venue") or None) or None,
        published=_iso_date(hit.get("publicationDate"), hit.get("year")),
        source_url=source_url,
        pdf_url=pdf_url,
        source_paper_id=spid,
        source=source,
        pdf_file=pdf_file,
        needs_review=False,
    )


def record_from_arxiv(hit: dict, pdf_file: str) -> dict:
    aid = hit["arxiv_id"]
    return _record(
        title=hit["title"],
        authors=hit["authors"] or ["Unknown"],
        abstract=hit.get("abstract"),
        venue=None,
        published=hit.get("published"),
        source_url=f"https://arxiv.org/abs/{aid}",
        pdf_url=f"https://arxiv.org/pdf/{aid}",
        source_paper_id=aid,
        source="ARXIV",
        pdf_file=pdf_file,
        needs_review=False,
    )


def record_unresolved(seed_title: str, authors: list[str], abstract: Optional[str],
                      published: Optional[str], pdf_file: str) -> dict:
    # sourceUrl is required + must be a valid URL: park a search URL the agent/user replaces.
    search_url = "https://www.semanticscholar.org/search?q=" + urllib.parse.quote(seed_title or pdf_file)
    return _record(
        title=seed_title or Path(pdf_file).stem,
        authors=authors or ["Unknown"],
        abstract=abstract,
        venue=None,
        published=published or date.today().isoformat(),
        source_url=search_url,
        pdf_url=None,
        source_paper_id=None,
        source="OPENACCESS",
        pdf_file=pdf_file,
        needs_review=True,
    )


def _record(*, title, authors, abstract, venue, published, source_url, pdf_url,
            source_paper_id, source, pdf_file, needs_review) -> dict:
    rec = {
        "title": title,
        "authors": authors,
        "abstract": abstract or None,
        "venue": venue,
        "publishedDate": published or date.today().isoformat(),
        "sourceUrl": source_url,
        "pdfUrl": pdf_url,
        "sourcePaperId": source_paper_id,
        "source": source,
        "codeUrls": [],
        "additionalSources": [],
        "pdfFile": pdf_file,
    }
    if needs_review:
        rec["needsReview"] = True
    return rec


# --------------------------------------------------------------------------- helpers

def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").replace("-\n", "").replace("\n", " ")).strip()


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _looks_like_authors(line: str) -> bool:
    if not line or "@" in line or len(line) > 200:
        return False
    return bool(re.search(r",| and ", line)) and sum(c.isupper() for c in line) >= 2


def _split_authors(line: str) -> list[str]:
    parts = re.split(r",| and |;", line)
    return [re.sub(r"\d|\*|†|‡", "", p).strip() for p in parts if p.strip()] or ["Unknown"]


def _iso_date(pub_date: Optional[str], year: Optional[int]) -> Optional[str]:
    if pub_date and re.fullmatch(r"\d{4}-\d{2}-\d{2}", pub_date):
        return pub_date
    if year:
        return f"{int(year):04d}-01-01"
    return None


def _parse_pdf_date(raw: Optional[str]) -> Optional[str]:
    # PDF dates look like "D:20250114093000Z"; we only need YYYY-MM-DD.
    if not raw:
        return None
    m = re.search(r"(\d{4})(\d{2})(\d{2})", raw)
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


# --------------------------------------------------------------------------- main

def resolve_pdf(pdf: Path, min_score: float, sleep: float) -> dict:
    seed_title, full_text, meta_date = page1_seed(pdf)
    ss_hit, ss_score = best_match(seed_title, semantic_scholar(seed_title, sleep))
    if ss_hit and ss_score >= min_score:
        return record_from_ss(ss_hit, pdf.name)
    ax_hit, ax_score = best_match(seed_title, arxiv(seed_title, sleep))
    if ax_hit and ax_score >= min_score:
        return record_from_arxiv(ax_hit, pdf.name)
    # Best effort: keep the closer of the two weak hits' abstract, flag for review.
    fallback = ss_hit if ss_score >= ax_score else ax_hit
    abstract = (fallback or {}).get("abstract")
    return record_unresolved(seed_title, guess_authors(full_text, seed_title), abstract,
                             meta_date, pdf.name)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("folder", type=Path, help="folder of locally-collected PDFs")
    ap.add_argument("--min-score", type=float, default=0.72, help="title-match threshold (0-1)")
    ap.add_argument("--sleep", type=float, default=1.0, help="seconds between API calls (be polite)")
    ap.add_argument("--limit", type=int, default=None, help="cap the number of PDFs processed")
    args = ap.parse_args()

    folder: Path = args.folder.expanduser().resolve()
    if not folder.is_dir():
        print(f"error: {folder} is not a directory", file=sys.stderr)
        return 2

    pdfs = sorted(p for p in folder.glob("*.pdf") if p.is_file())
    if args.limit:
        pdfs = pdfs[: args.limit]
    if not pdfs:
        print(f"error: no PDFs in {folder}", file=sys.stderr)
        return 2

    records, review = [], []
    for i, pdf in enumerate(pdfs, 1):
        rec = resolve_pdf(pdf, args.min_score, args.sleep)
        records.append(rec)
        tag = "review" if rec.get("needsReview") else rec["source"]
        print(f"[{i}/{len(pdfs)}] {pdf.name} -> {tag}: {rec['title'][:70]}")
        if rec.get("needsReview"):
            review.append(pdf.name)

    out = folder / "candidates.json"
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"\nwrote {len(records)} record(s) -> {out}")
    if review:
        print(f"{len(review)} need review (fix sourceUrl/venue/publishedDate, then re-validate):")
        for name in review:
            print(f"  - {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

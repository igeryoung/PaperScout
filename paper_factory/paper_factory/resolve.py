"""Resolve free-text paper titles to ``Paper`` records via the arXiv API.

The "new batch from titles" entry path: a user pastes paper titles (one per line);
for each we query arXiv's Atom API, pick the best title match, and build a ``PENDING``
paper that carries a ``pdfUrl`` (so the normal Download-PDF / auto-download flow can
fetch it). Pure stdlib (``urllib`` + ``xml.etree``) so it stays in keeping with
:mod:`paper_factory.pdf` and needs no extra dependency.

Field mapping mirrors ``src/server/sources/arxiv.ts`` (the TS arXiv source): each
match becomes ``source="ARXIV"``, ``sourcePaperId=<arxiv id>``, the abs page as
``sourceUrl`` and the pdf link as ``pdfUrl``.
"""

from __future__ import annotations

import re
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Callable, Optional
from xml.etree import ElementTree as ET

from .models import Paper, Stage, make_paper_id, normalize_title

ARXIV_API = "https://export.arxiv.org/api/query"
_ATOM = "{http://www.w3.org/2005/Atom}"
_ARXIV = "{http://arxiv.org/schemas/atom}"  # arxiv:comment, arxiv:journal_ref

# Accept the best arXiv hit only when its title is this similar to the queried one.
# Titles here are distinctive (acronym + descriptive phrase), so a real match scores
# well above this; the floor mainly rejects "no good hit" cases.
ACCEPT_THRESHOLD = 0.72

# arXiv asks for <= 1 request / 3s from a script; we poll a few titles, so pace them.
DEFAULT_DELAY = 3.0

_GITHUB_RE = re.compile(r"https?://github\.com/[A-Za-z0-9_.\-/#?=&]+")


@dataclass
class ResolveResult:
    papers: list[Paper] = field(default_factory=list)
    # (input line, reason) for titles we could not confidently match.
    unresolved: list[tuple[str, str]] = field(default_factory=list)

    def summary(self) -> str:
        lines = [f"{len(self.papers)} title(s) resolved on arXiv."]
        if self.unresolved:
            lines.append(f"{len(self.unresolved)} could not be matched:")
            lines += [f"  • {t}  ({why})" for t, why in self.unresolved]
        return "\n".join(lines)


def parse_titles(text: str) -> list[str]:
    """Split a pasted blob into cleaned, de-duplicated title lines (order kept)."""
    out: list[str] = []
    seen: set[str] = set()
    for line in text.splitlines():
        title = clean_title(line)
        if not title:
            continue
        key = normalize_title(title)
        if key in seen:
            continue
        seen.add(key)
        out.append(title)
    return out


def clean_title(raw: str) -> str:
    """A single pasted line -> a searchable title (drop a trailing ``.pdf``, collapse ws)."""
    title = raw.strip()
    if title.lower().endswith(".pdf"):
        title = title[:-4].strip()
    return re.sub(r"\s+", " ", title)


def _similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_title(a), normalize_title(b)).ratio()


# Conference acronyms recognised in an arXiv comment / journal_ref. Aliases map to a
# canonical label; multi-word keys (e.g. "acm mm") allow flexible whitespace in the
# regex below, and longer keys are tried first so "acm mm" wins over a bare "mm".
_VENUE_ALIASES = {
    "neurips": "NeurIPS", "nips": "NeurIPS",
    "icml": "ICML", "iclr": "ICLR", "aaai": "AAAI", "ijcai": "IJCAI",
    "cvpr": "CVPR", "iccv": "ICCV", "eccv": "ECCV", "wacv": "WACV", "accv": "ACCV",
    "3dv": "3DV", "bmvc": "BMVC",
    "siggraph asia": "SIGGRAPH Asia", "siggraph": "SIGGRAPH",
    "acm multimedia": "ACM MM", "acm mm": "ACM MM", "acmmm": "ACM MM",
    "acl": "ACL", "emnlp": "EMNLP", "naacl": "NAACL",
    "corl": "CoRL", "icra": "ICRA", "iros": "IROS",
}

_VENUE_RE = re.compile(
    r"\b("
    + "|".join(
        r"\s+".join(re.escape(tok) for tok in k.split())
        for k in sorted(_VENUE_ALIASES, key=len, reverse=True)
    )
    # not-a-letter (rather than \b) so a glued year like "CVPR2026" still parses,
    # while "cvpr" inside a longer word does not.
    + r")(?![A-Za-z])[\s'’\-]*(\d{4})?",
    re.IGNORECASE,
)


def detect_venue(*texts: Optional[str]) -> Optional[str]:
    """Read a conference label like ``"CVPR 2026"`` out of arXiv comment/journal_ref
    text, or ``None`` if no known conference is mentioned.

    Handles the common phrasings — "Accepted to CVPR 2026", "Accepted by CVPR2026",
    "CVPR2026 camera-ready" — by matching a known acronym plus an optional adjacent
    year, and canonicalising the label (so casing/spacing differences collapse).
    """
    for text in texts:
        if not text:
            continue
        m = _VENUE_RE.search(text)
        if not m:
            continue
        name = _VENUE_ALIASES[re.sub(r"\s+", " ", m.group(1).lower())]
        return f"{name} {m.group(2)}" if m.group(2) else name
    return None


@dataclass
class _Entry:
    title: str
    authors: list[str]
    abstract: Optional[str]
    published_date: str
    source_url: str
    pdf_url: Optional[str]
    arxiv_id: str
    comment: Optional[str] = None
    journal_ref: Optional[str] = None


def _text(node: Optional[ET.Element]) -> str:
    return re.sub(r"\s+", " ", (node.text or "")).strip() if node is not None else ""


def _parse_feed(xml: str) -> list[_Entry]:
    root = ET.fromstring(xml)
    entries: list[_Entry] = []
    for e in root.findall(f"{_ATOM}entry"):
        atom_id = _text(e.find(f"{_ATOM}id"))
        arxiv_id = re.sub(r"v\d+$", "", atom_id.rsplit("/", 1)[-1]) if atom_id else ""
        if not arxiv_id:
            continue
        authors = [
            _text(a.find(f"{_ATOM}name"))
            for a in e.findall(f"{_ATOM}author")
            if _text(a.find(f"{_ATOM}name"))
        ]
        pdf_url = None
        for link in e.findall(f"{_ATOM}link"):
            if link.get("type") == "application/pdf":
                pdf_url = link.get("href")
                break
        entries.append(
            _Entry(
                title=_text(e.find(f"{_ATOM}title")),
                authors=authors,
                abstract=_text(e.find(f"{_ATOM}summary")) or None,
                published_date=_text(e.find(f"{_ATOM}published"))[:10],
                source_url=atom_id.replace("http://", "https://"),
                pdf_url=pdf_url,
                arxiv_id=arxiv_id,
                comment=_text(e.find(f"{_ARXIV}comment")) or None,
                journal_ref=_text(e.find(f"{_ARXIV}journal_ref")) or None,
            )
        )
    return entries


def _query(search: str, max_results: int, timeout: int) -> list[_Entry]:
    url = f"{ARXIV_API}?" + urllib.parse.urlencode(
        {"search_query": search, "start": 0, "max_results": max_results}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "paper-factory/0.1"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted host)
        return _parse_feed(resp.read().decode("utf-8"))


def _best_match(title: str, entries: list[_Entry]) -> Optional[tuple[_Entry, float]]:
    scored = [(e, _similarity(title, e.title)) for e in entries]
    if not scored:
        return None
    return max(scored, key=lambda t: t[1])


def _entry_to_paper(e: _Entry) -> Paper:
    code_urls = _GITHUB_RE.findall(e.abstract or "")
    return Paper(
        id=make_paper_id("ARXIV", e.arxiv_id, e.source_url),
        title=e.title,
        authors=e.authors,
        abstract=e.abstract,
        venue=detect_venue(e.comment, e.journal_ref),
        published_date=e.published_date,
        source_url=e.source_url,
        pdf_url=e.pdf_url,
        source_paper_id=e.arxiv_id,
        source="ARXIV",
        code_urls=[u.rstrip(".,;:)]>") for u in code_urls],
        stage=Stage.PENDING,
    )


def resolve_title(title: str, *, max_results: int = 8, timeout: int = 30) -> Optional[Paper]:
    """Resolve one title to a ``PENDING`` ``Paper``, or ``None`` if no confident match.

    Queries the title against arXiv's ``ti:`` field (quoted phrase), then falls back
    to a broad ``all:`` search; the best-scoring hit wins if it clears the threshold.
    """
    cleaned = clean_title(title)
    if not cleaned:
        return None
    phrase = cleaned.replace('"', "")
    for search in (f'ti:"{phrase}"', f"all:{phrase}"):
        entries = _query(search, max_results, timeout)
        best = _best_match(cleaned, entries)
        if best and best[1] >= ACCEPT_THRESHOLD:
            return _entry_to_paper(best[0])
    return None


def resolve_titles(
    titles: list[str],
    *,
    delay: float = DEFAULT_DELAY,
    on_progress: Optional[Callable[[int, int, str], None]] = None,
) -> ResolveResult:
    """Resolve many titles, pacing requests. ``on_progress(done, total, title)`` is
    called before each lookup so a GUI can show a progress dialog."""
    result = ResolveResult()
    for i, title in enumerate(titles):
        if on_progress is not None:
            on_progress(i, len(titles), title)
        if i and delay:
            time.sleep(delay)
        try:
            paper = resolve_title(title)
        except Exception as e:  # noqa: BLE001 — one bad lookup must not sink the batch
            result.unresolved.append((title, f"lookup error: {e}"))
            continue
        if paper is None:
            result.unresolved.append((title, "no confident arXiv match"))
        else:
            result.papers.append(paper)
    return result

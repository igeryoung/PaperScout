"""Import crawl output (``CandidateRecord[]`` JSON) from the inbox into the store.

The crawl skill drops fixed-format files into ``data/factory/inbox/``; each is a JSON
array shaped exactly like ``data/sample/candidates.json``. We upsert each record as a
``PENDING`` paper, deduped by ``<source>:<sourcePaperId>``.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from . import config
from .db import Store
from .models import Paper, Stage, make_paper_id


def _record_to_paper(rec: dict[str, Any]) -> Paper:
    source = rec["source"]
    spid = rec.get("sourcePaperId")
    source_url = rec["sourceUrl"]
    return Paper(
        id=make_paper_id(source, spid, source_url),
        title=rec["title"],
        authors=list(rec.get("authors") or []),
        abstract=rec.get("abstract"),
        venue=rec.get("venue"),
        published_date=rec["publishedDate"],
        source_url=source_url,
        pdf_url=rec.get("pdfUrl"),
        source_paper_id=spid,
        source=source,
        code_urls=list(rec.get("codeUrls") or []),
        additional_sources=list(rec.get("additionalSources") or []),
        stage=Stage.PENDING,
    )


def import_file(store: Store, path: Path) -> tuple[int, int]:
    """Import a single candidates JSON file. Returns (inserted, skipped)."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError(f"{path} is not a JSON array of CandidateRecord")
    inserted = skipped = 0
    for rec in data:
        try:
            paper = _record_to_paper(rec)
        except KeyError as e:
            raise ValueError(f"{path}: record missing required field {e}") from e
        if store.upsert_paper(paper):
            inserted += 1
        else:
            skipped += 1
    return inserted, skipped


def import_inbox(store: Store) -> dict[str, tuple[int, int]]:
    """Import every ``*.json`` in the inbox dir. Returns {filename: (inserted, skipped)}."""
    config.ensure_dirs()
    results: dict[str, tuple[int, int]] = {}
    for path in sorted(config.INBOX_DIR.glob("*.json")):
        results[path.name] = import_file(store, path)
    return results

#!/usr/bin/env python3
"""Example crawler for the Paper Factory inbox.

Queries one OpenReview v2 venue group for accepted papers and writes a fixed-format
CandidateRecord[] JSON into data/factory/inbox/. This is a *reference* — adapt the
acceptance filter per venue cycle as needed.

Usage:
    python3 example_crawl.py --venue-group "ICLR.cc/2026/Conference" \
        --venue-display "ICLR 2026" --limit 15
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

API = "https://api2.openreview.net/notes"
# repo root = three parents up from .claude/skills/crawl-conference-list/example_crawl.py
REPO_ROOT = Path(__file__).resolve().parents[3]
INBOX = REPO_ROOT / "data" / "factory" / "inbox"

ACCEPT_HINTS = ("oral", "spotlight", "poster", "accept")
GITHUB_RE = re.compile(r"https?://github\.com/[\w.-]+/[\w.-]+")
ARXIV_RE = re.compile(r"arxiv\.org/abs/(\d{4}\.\d{4,5})", re.I)


PAGE = 1000  # OpenReview v2 caps `limit` at 1000 per request


def _fetch_page(venue_group: str, page_limit: int, offset: int) -> list[dict]:
    url = (
        f"{API}?content.venueid={venue_group}&details=replies&sort=cdate:desc"
        f"&limit={page_limit}&offset={offset}"
    )
    req = urllib.request.Request(url, headers={"User-Agent": "paper-factory-crawl/0.1"})
    for attempt, backoff in enumerate((0, 2, 4)):
        if backoff:
            time.sleep(backoff)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:  # noqa: S310
                return json.loads(resp.read()).get("notes", [])
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
    return []


def fetch(venue_group: str, limit: int | None) -> list[dict]:
    """Fetch notes, paginating with offset. `limit=None` means every note."""
    notes: list[dict] = []
    offset = 0
    while True:
        want = PAGE if limit is None else min(PAGE, limit - len(notes))
        if want <= 0:
            break
        page = _fetch_page(venue_group, want, offset)
        if not page:
            break
        notes.extend(page)
        offset += len(page)
        if len(page) < want:
            break
        time.sleep(1)  # 1 req/sec — be polite
    return notes


def is_accepted(note: dict) -> bool:
    venue = ((note.get("content") or {}).get("venue") or {}).get("value", "")
    return any(h in venue.lower() for h in ACCEPT_HINTS)


def value(note: dict, key: str):
    return ((note.get("content") or {}).get(key) or {}).get("value")


def to_record(note: dict, venue_display: str) -> dict | None:
    title = value(note, "title")
    authors = value(note, "authors")
    if not title or not authors:
        return None
    nid = note["id"]
    abstract = value(note, "abstract")
    epoch = note.get("pdate") or note.get("cdate")
    published = (
        datetime.fromtimestamp(epoch / 1000, tz=timezone.utc).strftime("%Y-%m-%d")
        if epoch
        else datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    blob = " ".join(filter(None, [abstract, value(note, "code"), value(note, "html")]))
    code_urls = sorted(set(GITHUB_RE.findall(blob)))
    additional = []
    m = ARXIV_RE.search(blob or "")
    if m:
        additional.append(
            {"source": "ARXIV", "sourceUrl": f"https://arxiv.org/abs/{m.group(1)}", "sourcePaperId": m.group(1)}
        )
    venue_full = value(note, "venue") or venue_display
    return {
        "title": title,
        "authors": list(authors),
        "abstract": abstract,
        "venue": venue_full,
        "publishedDate": published,
        "sourceUrl": f"https://openreview.net/forum?id={nid}",
        "pdfUrl": f"https://openreview.net/pdf?id={nid}",
        "sourcePaperId": nid,
        "source": "OPENREVIEW",
        "codeUrls": code_urls,
        "additionalSources": additional,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--venue-group", required=True, help='e.g. "ICLR.cc/2026/Conference"')
    ap.add_argument("--venue-display", required=True, help='e.g. "ICLR 2026"')
    ap.add_argument("--limit", type=int, default=50)
    ap.add_argument("--all", action="store_true", help="ignore --limit, fetch every accepted note")
    args = ap.parse_args()

    notes = fetch(args.venue_group, None if args.all else args.limit)
    records = [r for n in notes if is_accepted(n) and (r := to_record(n, args.venue_display))]

    INBOX.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", args.venue_display.lower()).strip("-")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    out = INBOX / f"{slug}-{ts}.json"
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(records)} record(s) -> {out}")
    print(f"validate with: npm run validate:candidates {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

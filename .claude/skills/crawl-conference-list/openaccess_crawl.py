#!/usr/bin/env python3
"""Crawler for open-access vision / multimedia venues that are NOT on OpenReview.

Covers the venue families that publish outside OpenReview:

    CVPR / ICCV / WACV   -> CVF Open Access  (openaccess.thecvf.com)  [pdf + arXiv inline]
    ECCV                 -> ECVA             (ecva.net)               [pdf, no arXiv inline]
    ACM MM / ACCV        -> Crossref         (api.crossref.org)       [metadata only, no open pdf]

Writes a fixed-format CandidateRecord[] JSON into data/factory/inbox/ — the same
shape as data/sample/candidates.json and example_crawl.py, EXCEPT the records use
the `OPENACCESS` source (added to the Source enum so these venues are ingestible).
Run `npm run validate:candidates <file>` after.

Usage:
    python3 openaccess_crawl.py --venue CVPR --year 2024 --limit 15
    python3 openaccess_crawl.py --venue ECCV --year 2024 --all
    python3 openaccess_crawl.py --venue "ACM MM" --year 2024 --limit 15

Metadata-only by design (factory step 1): no PDF download, no scoring. Abstract is
left null for these venues — the evaluate step fetches the PDF later. CVF/ECVA give a
real camera-ready `pdfUrl`; Crossref venues (ACM MM / ACCV) have `pdfUrl: null`.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
INBOX = REPO_ROOT / "data" / "factory" / "inbox"

UA = "paper-factory-crawl/0.1 (mailto:asd7415953@gmail.com)"
ARXIV_RE = re.compile(r"arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})", re.I)
TAG_RE = re.compile(r"<[^>]+>")

# venue -> (strategy, params). `month` is the conference month used for publishedDate
# (the listings have no per-paper date); it only needs to land in the right year.
VENUES: dict[str, dict] = {
    "CVPR": {"strategy": "cvf", "slug": "CVPR", "month": 6},
    "ICCV": {"strategy": "cvf", "slug": "ICCV", "month": 10},
    "WACV": {"strategy": "cvf", "slug": "WACV", "month": 1},
    "ECCV": {"strategy": "ecva", "month": 10},
    "ACCV": {"strategy": "cvf", "slug": "ACCV", "month": 12},
    "ACM MM": {"strategy": "crossref", "container": "ACM International Conference on Multimedia", "month": 10},
    "ACMMM": {"strategy": "crossref", "container": "ACM International Conference on Multimedia", "month": 10},
}


def fetch(url: str, *, as_json: bool = False):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt, backoff in enumerate((0, 2, 4)):
        if backoff:
            time.sleep(backoff)
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310
                raw = resp.read()
                return json.loads(raw) if as_json else raw.decode("utf-8", "replace")
        except Exception:  # noqa: BLE001
            if attempt == 2:
                raise
    raise RuntimeError("unreachable")


def clean(text: str) -> str:
    return html.unescape(TAG_RE.sub("", text)).replace("\xa0", " ").strip()


def record(*, title, authors, venue, published, source_url, pdf_url, spid, arxiv_id=None):
    additional = []
    if arxiv_id:
        additional.append(
            {
                "source": "ARXIV",
                "sourceUrl": f"https://arxiv.org/abs/{arxiv_id}",
                "sourcePaperId": arxiv_id,
            }
        )
    return {
        "title": title,
        "authors": authors,
        "abstract": None,
        "venue": venue,
        "publishedDate": published,
        "sourceUrl": source_url,
        "pdfUrl": pdf_url,
        "sourcePaperId": spid,
        "source": "OPENACCESS",
        "codeUrls": [],
        "additionalSources": additional,
    }


# --------------------------------------------------------------------------- CVF
def crawl_cvf(slug: str, year: int, published: str, limit: int | None) -> list[dict]:
    host = "https://openaccess.thecvf.com"
    page = fetch(f"{host}/{slug}{year}?day=all")
    venue = f"{slug} {year}"
    out: list[dict] = []
    for block in re.split(r'<dt class="ptitle">', page)[1:]:
        m = re.search(r'<a href="(/content/[^"]+?_paper\.html)">(.*?)</a>', block, re.S)
        if not m:
            continue
        href, title = m.group(1), clean(m.group(2))
        authors = [clean(a) for a in re.findall(r'name="query_author" value="([^"]+)"', block)]
        if not title or not authors:
            continue
        pdf_url = host + href.replace("/html/", "/papers/").replace(".html", ".pdf")
        spid = href.rsplit("/", 1)[-1][: -len(".html")]
        am = ARXIV_RE.search(block)
        out.append(
            record(
                title=title,
                authors=authors,
                venue=venue,
                published=published,
                source_url=host + href,
                pdf_url=pdf_url,
                spid=spid,
                arxiv_id=am.group(1) if am else None,
            )
        )
        if limit and len(out) >= limit:
            break
    return out


# -------------------------------------------------------------------------- ECVA
def crawl_ecva(year: int, published: str, limit: int | None) -> list[dict]:
    host = "https://www.ecva.net/"
    page = fetch(f"{host}papers.php")
    venue = f"ECCV {year}"
    out: list[dict] = []
    for block in re.split(r'<dt class="ptitle">', page)[1:]:
        m = re.search(r"<a href=['\"]?(papers/eccv_(\d{4})/[^'\"> ]+?\.php)", block)
        if not m or int(m.group(2)) != year:
            continue
        href = m.group(1)
        tm = re.search(r"\.php>\s*(.*?)</a>", block, re.S)
        title = clean(tm.group(1)) if tm else ""
        dd = re.search(r"</dt>\s*<dd>(.*?)</dd>", block, re.S)
        authors = []
        if dd:
            authors = [clean(a).rstrip("*").strip() for a in dd.group(1).split(",")]
            authors = [a for a in authors if a]
        pm = re.search(r"href=['\"]?(papers/eccv_\d+/[^'\"> ]+?(?<!-supp)\.pdf)", block)
        if not title or not authors:
            continue
        spid = (pm.group(1).rsplit("/", 1)[-1][:-4] if pm else href.rsplit("/", 1)[-1][:-4])
        out.append(
            record(
                title=title,
                authors=authors,
                venue=venue,
                published=published,
                source_url=host + href,
                pdf_url=(host + pm.group(1)) if pm else None,
                spid=f"eccv{year}-{spid}",
            )
        )
        if limit and len(out) >= limit:
            break
    return out


# ---------------------------------------------------------------------- Crossref
def crawl_crossref(container: str, year: int, published: str, limit: int | None) -> list[dict]:
    venue_disp = "ACM MM" if "Multimedia" in container else "ACCV"
    venue = f"{venue_disp} {year}"
    needle = container.lower()
    out: list[dict] = []
    cursor = "*"
    pages = 0
    max_pages = 40  # safety cap; relevant items are relevance-ranked to the front
    while pages < max_pages:
        pages += 1
        q = {
            "query.container-title": container,
            "filter": f"type:proceedings-article,from-pub-date:{year}-01-01,until-pub-date:{year}-12-31",
            "rows": "200",
            "cursor": cursor,
            "mailto": "asd7415953@gmail.com",
            "select": "title,author,DOI,container-title,published",
        }
        data = fetch("https://api.crossref.org/works?" + urllib.parse.urlencode(q), as_json=True)
        msg = data.get("message", {})
        items = msg.get("items", [])
        if not items:
            break
        cursor = msg.get("next-cursor") or ""
        matched_this_page = 0
        for it in items:
            ct = " ".join(it.get("container-title") or []).lower()
            if needle not in ct:
                continue
            yr = ((it.get("published") or {}).get("date-parts") or [[None]])[0][0]
            if yr != year:
                continue
            title = clean((it.get("title") or [""])[0])
            authors = [
                clean(f"{a.get('given','')} {a.get('family','')}".strip())
                for a in (it.get("author") or [])
            ]
            authors = [a for a in authors if a]
            doi = it.get("DOI")
            if not title or not authors or not doi:
                continue
            matched_this_page += 1
            out.append(
                record(
                    title=title,
                    authors=authors,
                    venue=venue,
                    published=published,
                    source_url=f"https://doi.org/{doi}",
                    pdf_url=None,
                    spid=doi,
                )
            )
            if limit and len(out) >= limit:
                return out
        if not cursor or matched_this_page == 0:
            break
        time.sleep(1)
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--venue", required=True, help='CVPR | ICCV | WACV | ECCV | "ACM MM" | ACCV')
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--limit", type=int, default=15, help="max records (default 15)")
    ap.add_argument("--all", action="store_true", help="ignore --limit, take every paper")
    args = ap.parse_args()

    key = args.venue.strip().upper().replace("  ", " ")
    cfg = VENUES.get(key) or VENUES.get(args.venue.strip())
    if not cfg:
        raise SystemExit(f"unknown venue {args.venue!r}; known: {', '.join(VENUES)}")

    limit = None if args.all else args.limit
    published = f"{args.year}-{cfg['month']:02d}-01"

    if cfg["strategy"] == "cvf":
        records = crawl_cvf(cfg["slug"], args.year, published, limit)
    elif cfg["strategy"] == "ecva":
        records = crawl_ecva(args.year, published, limit)
    else:
        records = crawl_crossref(cfg["container"], args.year, published, limit)

    INBOX.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-z0-9]+", "-", f"{args.venue} {args.year}".lower()).strip("-")
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H%M")
    out = INBOX / f"{slug}-{ts}.json"
    out.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(records)} record(s) -> {out}")
    print(f"validate with: npm run validate:candidates {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

---
name: crawl-conference-list
description: Crawl accepted papers from a top conference and write a fixed-format CandidateRecord[] JSON into data/factory/inbox/ for the Paper Factory GUI to import. Two sources — OpenReview (NeurIPS / ICML / ICLR / AAAI) and Open Access (CVPR / ICCV / WACV / ACCV / ECCV / ACM MM). Same output shape as data/sample/candidates.json.
tools: [Bash, Read, Write]
---

# Crawl Conference List

Produce the **paper pool** that the Paper Factory GUI consumes. This is the factory's
step 1 (the "pending" feed): metadata only — **no PDFs, no scoring**.

## Pick the crawler by venue

Top conferences live on two disjoint publication stacks. Choose the matching script:

| Venue family | Crawler | Source | `source` value |
|---|---|---|---|
| NeurIPS / ICML / ICLR / AAAI | `example_crawl.py` | OpenReview v2 API | `OPENREVIEW` |
| CVPR / ICCV / WACV / ACCV | `openaccess_crawl.py` | CVF Open Access (`openaccess.thecvf.com`) | `OPENACCESS` |
| ECCV | `openaccess_crawl.py` | ECVA (`ecva.net`) | `OPENACCESS` |
| ACM MM | `openaccess_crawl.py` | Crossref (`api.crossref.org`) | `OPENACCESS` |

CVPR/ECCV/ACM MM/ACCV are **not on OpenReview** — they use CMT / CVF / Springer / ACM DL,
so there is no OpenReview venueid to query. Use `openaccess_crawl.py` for them.

## Output contract (NON-NEGOTIABLE)

- **File path:** `data/factory/inbox/<venue>-<YYYY-MM-DD-HHMM>.json` (UTC). The GUI's
  *Import inbox* button reads every `*.json` here and upserts each record as a `PENDING`
  paper, deduped by `<source>:<sourcePaperId>`.
- **Format:** a JSON **array** of `CandidateRecord` objects — identical shape to
  `data/sample/candidates.json` (read it first to lock the shape).
- **Schema:** `src/server/schema/candidate.ts` (zod). The file MUST pass
  `npm run validate:candidates <path>` or the GUI import / downstream ingest will reject it.

## CandidateRecord fields

```
{
  "title": string,
  "authors": string[],
  "abstract": string | null,
  "venue": string,                 // REQUIRED, e.g. "ICLR 2026 Poster"
  "publishedDate": "YYYY-MM-DD",
  "sourceUrl": "https://openreview.net/forum?id=...",
  "pdfUrl": "https://openreview.net/pdf?id=..." | null,
  "sourcePaperId": string,         // OpenReview note id
  "source": "OPENREVIEW",
  "codeUrls": string[],
  "additionalSources": [ { "source": "ARXIV", "sourceUrl": ..., "sourcePaperId": ... } ]
}
```

## OpenReview crawler — `example_crawl.py`

For **NeurIPS / ICML / ICLR / AAAI**. Queries one OpenReview venue group, maps notes →
CandidateRecord, writes the inbox file. Adapt `--venue-group` / `--venue-display`, then:

```bash
python3 .claude/skills/crawl-conference-list/example_crawl.py \
  --venue-group "ICLR.cc/2026/Conference" \
  --venue-display "ICLR 2026" \
  --limit 15
```

## Open-access crawler — `openaccess_crawl.py`

For **CVPR / ICCV / WACV / ACCV / ECCV / ACM MM** (the venues not on OpenReview). It
selects the right strategy per venue (CVF scrape / ECVA scrape / Crossref query), maps
each paper → CandidateRecord with `source: "OPENACCESS"`, and writes the inbox file:

```bash
python3 .claude/skills/crawl-conference-list/openaccess_crawl.py --venue CVPR --year 2024 --limit 15
python3 .claude/skills/crawl-conference-list/openaccess_crawl.py --venue ECCV --year 2024 --all
python3 .claude/skills/crawl-conference-list/openaccess_crawl.py --venue "ACM MM" --year 2024 --limit 15
```

`--all` takes every accepted paper (CVPR/ICCV are ~2.5–2.9k each); omit it to cap at
`--limit` (default 15). Notes:

- **CVF venues (CVPR/ICCV/WACV/ACCV)** give a real camera-ready `pdfUrl` and an inline
  arXiv id (~65%) folded into `additionalSources` (so they dedup against existing arXiv papers).
- **ECCV (ECVA)** gives a `pdfUrl` but no inline arXiv id.
- **ACM MM (Crossref)** is metadata only: `pdfUrl: null`, no abstract. The evaluate step
  cannot fetch a PDF for these — lower fidelity than the CVF/ECVA venues.
- `abstract` is left `null` for all open-access venues (metadata-only stage; the evaluate
  step reads the PDF later). This is schema-valid (`abstract` is nullable).

Both scripts write `data/factory/inbox/<slug>-<ts>.json`. Run
`npm run validate:candidates <that file>` to confirm before telling the user to click *Import inbox*.

## Field mapping (OpenReview note → CandidateRecord)

```
note.content.title.value            → title
note.content.authors.value          → authors
note.content.abstract.value         → abstract
<derived from venue group id>       → venue
note.cdate / note.pdate (ms epoch)  → publishedDate (YYYY-MM-DD UTC)
"…/forum?id=<note.id>"              → sourceUrl
"…/pdf?id=<note.id>"               → pdfUrl
note.id                             → sourcePaperId
"OPENREVIEW"                        → source
GitHub URLs parsed from content     → codeUrls (else [])
arXiv id parsed from abstract       → additionalSources (else [])
```

## Rules

- **Use the right source per venue** (see the table above). OpenReview venues never appear
  on Open Access and vice-versa — don't cross them.
- **OpenReview** (`api2.openreview.net`, v2): 1 request/second; retry with exponential backoff
  (2s, 4s) on 429/5xx. Keep only **accepted** notes (Oral / Spotlight / Poster / Accept).
- **Open Access**: CVF/ECVA listing pages are one request per venue-year; Crossref paginates
  with a cursor. Be polite (send the `mailto` UA already in the script).
- Drop any record missing `title` or `authors`.
- Target 10–15 records by default; pass `--all` / a large `--limit` only when the user
  explicitly asks for every paper. Never pad by relaxing the venue/year filter.

## Done when

- `data/factory/inbox/<file>.json` exists and `npm run validate:candidates <file>` exits 0.
- You report the inbox path and per-venue count, and tell the user to click **Import inbox**.

> `OPENACCESS` is a real value in the `Source` enum (`prisma/schema.prisma`,
> `src/server/schema/candidate.ts`) and is wired through dedup, the UI label, and i18n.
> The Paper Factory importer treats `source` as a free string, so no GUI change is needed.

## Out of scope

- Don't download PDFs, score, truncate, or crop — those are the GUI's / evaluate steps.
- Don't write to the SQLite DB or Postgres — the GUI import and ingest own those.

# Paper Factory

A human-in-the-loop desktop GUI (PySide6 + PyMuPDF) that supervises the paper
collection → evaluation → ingest pipeline. It replaces the blind, agent-only steps
(PDF truncation, figure crop, eval review) with explicit, resumable, human-driven ones,
and tracks every paper's state in a global SQLite store.

## Pipeline

```
crawl skill ─▶ PENDING ─select▶ batch ─▶ DOWNLOADED ─▶ TRUNCATED ─▶ CROPPED ─▶ EXPORTED
                                                                                   │
                                                       (eval agent, out-of-GUI)    ▼
           INGESTED ◀─ingest─ REVIEWED(pass) ◀─review─ EVALUATED ◀─import results──┘
```

Coarse buckets shown in the table: **pending** (`PENDING`), **processing**
(`DOWNLOADED…EVALUATED`), **finish** (`REVIEWED`, `INGESTED`).

## Setup

```bash
cd paper_factory
python3 -m venv .venv
.venv/bin/pip install -e .
.venv/bin/python -m paper_factory      # or: .venv/bin/paper-factory
```

Working data lives in `../data/factory/` (override with `PAPER_FACTORY_DATA`).

## How to use

1. **Crawl** — run the `crawl-conference-list` skill (or its
   `.claude/skills/crawl-conference-list/example_crawl.py`) to drop a
   `CandidateRecord[]` JSON into `data/factory/inbox/`.
2. **Import inbox** — papers appear as `PENDING`, grouped Year ▸ Conference ▸ Paper
   in the tree (each leaf is prefixed with its `[STAGE]` tag). Toggle **☰ Batches**
   in the toolbar to show the batch/filter sidebar.
3. **New batch from selection** — group papers to process together.
4. **Download PDF** → in the viewer, **Cut here** to truncate. **Double-click a page**
   to open the crop popup, drag a box, then **Confirm crop**. The cropped figure
   shows under **Cropped figure** with **View full** / **Delete crop**.
5. **Export for eval** — writes `data/factory/exports/batch-<id>/`.
6. Run the `evaluate-papers` skill on that dir → `evaluations.json`.
7. **Import eval results** → review each paper → **Pass / Reject**.
8. **Ingest passed** — bundles PASS papers and runs `npm run ingest` into the app's Postgres.

## Live DB tab

A second tab, **Live DB**, views and maintains the papers that are actually live in
the app's Postgres — the records `Ingest passed` writes. It never touches Postgres
directly; it shells out to `scripts/factory-db.ts` (`npm run factory:db`), which goes
through Prisma, the same way ingest does.

- **Browse** — a paged, searchable table (search title/abstract/author, filter by
  venue/year, sort newest/oldest/score).
- **Edit in place** — core fields (title, venue, date, pdf, authors, abstract), tags,
  code links, the rendered figure (label/page/caption), and the selected evaluation
  (per-dimension scores + total, decision, and the localized summary/strengths/
  weaknesses/digest as JSON). **Save changes** writes directly to live Postgres;
  editing the title recomputes `normalizedTitle` (the `duplicateFingerprint` is kept
  stable). Saving marks all of a paper's tags `USER_GENERATED`.
- **Delete** — removes the paper (Prisma cascade). If the paper still has a local
  factory counterpart, its stage is reset from `INGESTED` back to `REVIEWED`.

> Edits/deletes hit the **production** DB with only a confirm dialog — there is no
> separate staging DB.

## Module map

| Module | Responsibility |
|---|---|
| `config.py` | Filesystem layout + repo-root discovery |
| `models.py` | `Stage`/`Bucket`/`Paper`/`Batch` + CandidateRecord mapping |
| `db.py` | SQLite store (papers + batches), row↔dataclass mapping |
| `importer.py` | inbox `CandidateRecord[]` → `PENDING` papers (dedup) |
| `pdf.py` | PyMuPDF: download, render, truncate, crop (GUI-free, testable) |
| `export.py` | batch → eval bundle (`candidates.json` + truncated PDFs + figures) |
| `eval_import.py` | `evaluations.json` → attach to papers by `joinKey`, `EVALUATED` |
| `ingest.py` | PASS papers → run-dir bundle → `scripts/ingest.ts` |
| `db_live.py` | live Postgres read/maintain via `npm run factory:db` (subprocess) |
| `ui/` | `main_window` (Pipeline + Live DB tabs), `pdf_view` (crop/truncate), `paper_panel` (review), `db_page` (Live DB) |

The Live DB tab is backed by `scripts/factory-db.ts` (`list`/`get`/`update`/`delete`).

The export/ingest bundles reuse the existing zod schemas
(`src/server/schema/candidate.ts`, `evaluation.ts`) and pass
`npm run validate:candidates|validate:evaluations`.

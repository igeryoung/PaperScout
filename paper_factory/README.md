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
2. **Import inbox** — papers appear as `PENDING`.
3. **New batch from selection** — group papers to process together.
4. **Download PDF** → in the viewer, **Cut here** to truncate, drag to **crop a figure**.
5. **Export for eval** — writes `data/factory/exports/batch-<id>/`.
6. Run the `evaluate-papers-from-bundle` skill on that dir → `evaluations.json`.
7. **Import eval results** → review each paper → **Pass / Reject**.
8. **Ingest passed** — bundles PASS papers and runs `npm run ingest` into the app's Postgres.

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
| `ui/` | `main_window`, `pdf_view` (crop/truncate), `paper_panel` (review) |

The export/ingest bundles reuse the existing zod schemas
(`src/server/schema/candidate.ts`, `evaluation.ts`) and pass
`npm run validate:candidates|validate:evaluations`.

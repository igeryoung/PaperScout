# Phase 2 — Source Collection (closed 2026-05-10)

**Goal:** Three source clients (arXiv / OpenReview / Hugging Face) each produce normalized `CandidateRecord` arrays. `collectFromAllSources()` returns 30 candidates with per-source quotas. Pipeline `collect` + `persist` works end-to-end **without LLM**, gated by a `runner` skeleton and a `POST /api/runs` endpoint.

**Status:** GO to Phase 2.5. Real `POST /api/runs` reaches `status='COMPLETED'` with 30 persisted papers; second run reports 30 EXISTING (full dedup). See `plan/log/2026-05-10.md` for the close-out.

## Why third

The schema (Phase 1) gives us a place to write to. Now we need things to write. Plug LLM on top in Phase 3.

## Goal checklist

### Common types (`src/server/sources/types.ts`)

- [x] Define `CandidateRecord`:
  ```ts
  type CandidateRecord = {
    title: string;
    authors: string[];
    abstract: string | null;
    venue: string | null;
    publishedDate: Date | null;
    sourceUrl: string;
    pdfUrl: string | null;
    sourcePaperId: string | null; // arxivId / openreviewId / hf slug
    source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE';
    codeUrls: string[];
    rawMetadata: unknown;
  };
  ```
- [x] Export a discriminated `SourceClient` interface: `name`, `fetch(): Promise<CandidateRecord[]>`

### arXiv client (`src/server/sources/arxiv.ts`)

- [x] Implement `fetchArxiv()`:
  - [x] Query `https://export.arxiv.org/api/query?search_query=cat:cs.CV&sortBy=submittedDate&sortOrder=descending&max_results=50`
  - [x] Restrict to last 48h via API filter (`submittedDate:[YYYYMMDD0000+TO+YYYYMMDD2359]`)
  - [x] Parse Atom XML with `fast-xml-parser`
  - [x] Map each `<entry>` to `CandidateRecord`:
    - title (collapse whitespace)
    - authors[]
    - abstract from `<summary>`
    - sourceUrl from `<id>`
    - pdfUrl: replace `abs/` with `pdf/` and append `.pdf`
    - sourcePaperId: extract arXiv id from `<id>`
    - publishedDate from `<published>`
    - venue: null (arXiv has no venue at submission time)
    - codeUrls: scan abstract for `github.com/...` links
- [x] Implement a 3s rate limiter between calls (arXiv guidelines)
- [x] Test with a recorded XML fixture under `tests/fixtures/sources/arxiv.xml`

### OpenReview client (`src/server/sources/openreview.ts`)

- [x] Use OpenReview API v2: `https://api2.openreview.net/notes/search?term=computer+vision&limit=30&sort=cdate:desc`
- [x] Filter to recent CV venues (CVPR / ICCV / ECCV / WACV workshops, ICLR submissions tagged CV) — implement a simple venueId allowlist
- [x] Map response → `CandidateRecord`:
  - title, authors, abstract
  - sourceUrl: `https://openreview.net/forum?id={id}`
  - pdfUrl: `https://openreview.net/pdf?id={id}`
  - sourcePaperId: forum id
  - venue: extract from invitation/venue field
- [x] Handle no-auth flow (V1 only reads public submissions)
- [x] Test with a recorded JSON fixture

### Hugging Face client (`src/server/sources/huggingface.ts`)

- [x] `https://huggingface.co/api/daily_papers` returns trending papers
- [x] Each entry has `paper.id` (often arXiv id), `paper.title`, `paper.summary`, `paper.authors`, `paper.publishedAt`
- [x] Map to `CandidateRecord`:
  - source: `HUGGINGFACE`
  - sourcePaperId: HF slug
  - sourceUrl: `https://huggingface.co/papers/{id}`
  - pdfUrl: derive from arXiv id if present (HF papers are arXiv mirrors)
  - venue: null
- [x] Filter out non-CV papers using a tag/title heuristic (HF returns multi-domain)
- [x] Test with a recorded JSON fixture

### Aggregator (`src/server/sources/index.ts`)

- [x] `collectFromAllSources(opts: { targetCount: 30 }): Promise<CandidateRecord[]>`
- [x] Run all three clients in `Promise.allSettled`
- [x] Within-batch dedup: if same arXiv id appears in arXiv and HF, keep arXiv copy but merge `codeUrls` and `huggingface` source pointer (record both `paper_sources` later)
- [x] Apply per-source quotas: 15 arXiv / 10 HF / 5 OpenReview, with overflow refilling from any source
- [x] Trim or pad to exactly 30
- [x] If a source fails, log and continue (PRD §21 reliability)

### Pipeline (`src/server/pipeline/`)

- [x] `collect.ts` — `collect(runId)` calls aggregator, returns `CandidateRecord[]`
- [x] `persist.ts` — `persistCandidates(runId, candidates)`:
  - For each candidate: run `findMatch` (Phase 1 dedup matcher)
  - If null: create Paper + PaperSource + PaperRunResult (`collection_status='new'`)
  - If match: ensure PaperSource for this source exists (else add); create PaperRunResult (`collection_status='existing'`); record PaperDuplicate row
- [x] `runner.ts` (skeleton) —
  - `startRun(): runId`: creates DailyRun row with `status='collecting'`
  - In a detached `Promise.resolve().then(...)`:
    - call `collect(runId)`
    - call `persistCandidates(runId, candidates)`
    - update `status='completed'` (LLM stages added in Phase 3)
  - Catches errors → `status='failed'`, log

### API routes

- [x] `src/app/api/runs/route.ts`:
  - POST → calls `runner.startRun()`, returns `{ id, status: 'collecting' }`
  - GET → returns last 20 runs with status (uses `runs.listByDate`)
- [x] `src/app/api/runs/[id]/route.ts`:
  - GET → `{ id, status, candidateCount: persisted_so_far, createdAt, completedAt }`

### Tests

- [x] `tests/fixtures/sources/arxiv.xml`, `openreview.json`, `huggingface.json` — copy from Phase 0.5 captures
- [x] `tests/unit/sources/arxiv.test.ts` — parses fixture, asserts CandidateRecord shape, ≥10 entries
- [x] `tests/unit/sources/openreview.test.ts` — same
- [x] `tests/unit/sources/huggingface.test.ts` — same
- [x] `tests/unit/sources/index.test.ts` — mocks each client, asserts within-batch dedup + quotas
- [x] `tests/integration/collect-persist.test.ts` —
  - Spins up real Postgres test schema
  - Mocks the three source clients to return controlled CandidateRecords (3 batches: 30 fresh, then 30 with 10 dupes vs first batch, then 30 with arxiv-id collision)
  - After 3 runs, asserts: distinct papers count, per-run results count, dedup linkage rows

## Files created in this phase

```
src/server/sources/types.ts
src/server/sources/arxiv.ts
src/server/sources/openreview.ts
src/server/sources/huggingface.ts
src/server/sources/index.ts
src/server/pipeline/collect.ts
src/server/pipeline/persist.ts
src/server/pipeline/runner.ts
src/app/api/runs/route.ts
src/app/api/runs/[id]/route.ts
tests/fixtures/sources/arxiv.xml
tests/fixtures/sources/openreview.json
tests/fixtures/sources/huggingface.json
tests/unit/sources/arxiv.test.ts
tests/unit/sources/openreview.test.ts
tests/unit/sources/huggingface.test.ts
tests/unit/sources/index.test.ts
tests/integration/collect-persist.test.ts
```

## Verification checklist

- [x] `npm test` green
- [x] `curl -X POST http://localhost:3000/api/runs` returns 200 with `{ id, status: 'collecting' }`
- [x] After ~30s: `curl http://localhost:3000/api/runs/<id>` returns `{ status: 'completed' }` and `paper_run_results` has 30 rows for that runId
- [x] Re-run: most candidates report `collection_status='existing'`; `paper_duplicates` has new rows; no duplicate Paper rows by `duplicate_fingerprint`
- [x] `/library` page now lists ≥30 papers from real sources
- [x] Logs show source-collection counts per source
- [x] `plan/STATE.md` updated to point to Phase 2.5
- [x] New entry appended at top of today's `plan/log/YYYY-MM-DD.md`

## Exit criteria

A real `POST /api/runs` reaches `status='completed'` with 30 persisted papers and visible dedup. No LLM yet.

## Supersedes / resolutions (2026-05-10 close-out)

The pre-implementation README above contains a few details that conflicted with what the codebase actually had or what Next.js 16 wants. Resolutions:

- **`CandidateRecord` already exists** in `src/server/schema/candidate.ts` (zod-validated, with `additionalSources[]` and ISO-string `publishedDate`). `src/server/sources/types.ts` re-exports it; no new type defined. The README's standalone shape with `Date` and `rawMetadata` was discarded.
- **Run statuses are uppercase Prisma enums** — `RUNNING` / `COMPLETED` / `FAILED` (not `'collecting'` / `'completed'`). API responses pass the enum value through.
- **`CollectionStatus` is uppercase** — `NEW` / `EXISTING` / `DUPLICATE`.
- **Background work uses `after()` from `next/server`**, not the README's "detached `Promise.resolve().then(...)`". `after()` is the documented Next.js 16 primitive and respects the request lifecycle. The route declares `maxDuration = 600` so the collection callback has a 10 minute platform budget.
- **Partial collection is allowed.** `collectFromAllSources({ targetCount: 30 })` returns up to 30 candidates. If sources under-deliver after dedup/filtering, the run still completes with the candidates that were persisted and logs `isPartial=true`; `/api/runs/[id]` reports the persisted result count.
- **Source fetches are bounded at 10 minutes.** Each source client uses the shared source fetch helper so stalled providers reject cleanly and the aggregator can continue with other sources.
- **arXiv pdfUrl is taken from `<link type="application/pdf">`**, not by string-replacing `abs/`→`pdf/`. The link element is authoritative; the URL pattern can change.
- **arXiv 48h `submittedDate:[…]` filter dropped.** `sortBy=submittedDate desc, max_results=50` plus the quota cap keeps results recent without an extra filter.
- **arXiv 3s rate limiter is exposed but not invoked** for the one-shot per-run flow. If we ever loop, we'll wire it in.
- **OpenReview venue allowlist deferred.** `term=computer+vision&limit=30&sort=cdate:desc` is the only filter; LLM screening (Phase 3) handles topical drift.
- **HF→arXiv pdfUrl** derived only when `paper.id` matches `^\d{4}\.\d{4,5}$`. Otherwise `pdfUrl: null`. Matches the schema's nullable contract.
- **`paper_run_results` is unique on `(runId, paperId)`** — within-batch dedup at the aggregator collapses cross-source duplicates BEFORE persist; persist additionally guards on `seenPaperId` for the rare fuzzy collision.
- **`daily_runs.ingest_source_dir`** is set to `null` for API-driven runs (the column was for filesystem ingest; nullable unique allows multiple nulls in Postgres).
- **Integration test isolated via `paperscout_test` schema**, gated by `RUN_INTEGRATION=1` plus `DATABASE_URL_TEST`. `npm run test:integration` skips unless explicitly opted in; this prevents stale local DB URLs from failing routine verification. `npm test` excludes integration so unit tests don't need a DB.
- **PaperSource persistence checks source identity, not just source type.** Existing papers can record multiple provenance rows for the same provider when the `sourcePaperId` or `sourceUrl` differs.
- **Runtime logs are structured.** Phase 2 server runtime uses `src/lib/logger.ts` with stable event names; see `plan/IMPLEMENTATION_PRINCIPLES.md`.
- **Fixtures captured live** via `scripts/capture-source-fixtures.ts` (re-runnable). Earlier `data/runs/2026-05-08-1743/candidates.json` is a parsed payload, not a raw API response.
- **Lint nit fixed:** `collect.ts` now logs `runId` instead of accepting `_runId` as an unused param (eslint-config-next doesn't honor underscore-prefixed args).
- **Bug found and fixed during smoke test:** `mergeAdditional` (within-batch dedup) was pushing `other.additionalSources` entries that duplicated the primary's identity, causing `Unique constraint failed on (source, source_paper_id)` when persist created the additional source row. Fixed by tracking the primary's identity in the seen-set before appending.

## Risks / pitfalls

- **arXiv 429s** if many requests in a row — rate limiter is mandatory (3s).
- **OpenReview API drift** — the v2 API has had recent changes. Pin behavior to a version field in metadata; surface 4xx clearly.
- **HF returns non-CV** — heuristic filter must be permissive; better to over-include and let LLM screening downrank than to miss good papers.
- **PDF URL inference** — HF→arXiv mapping isn't always present. Allow `pdfUrl=null` and let Phase 3's `analyze-pdf` mark `pdf_analysis_status='unavailable'`.
- **Detached promise after request returns** — Next.js dev server may not keep the worker alive across HMR. Document the limitation; production-ready behavior is fine in `next start`.

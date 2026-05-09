# Phase 2 — Source Collection

**Goal:** Three source clients (arXiv / OpenReview / Hugging Face) each produce normalized `CandidateRecord` arrays. `collectFromAllSources()` returns 30 candidates with per-source quotas. Pipeline `collect` + `persist` works end-to-end **without LLM**, gated by a `runner` skeleton and a `POST /api/runs` endpoint.

## Why third

The schema (Phase 1) gives us a place to write to. Now we need things to write. Plug LLM on top in Phase 3.

## Goal checklist

### Common types (`src/server/sources/types.ts`)

- [ ] Define `CandidateRecord`:
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
- [ ] Export a discriminated `SourceClient` interface: `name`, `fetch(): Promise<CandidateRecord[]>`

### arXiv client (`src/server/sources/arxiv.ts`)

- [ ] Implement `fetchArxiv()`:
  - [ ] Query `https://export.arxiv.org/api/query?search_query=cat:cs.CV&sortBy=submittedDate&sortOrder=descending&max_results=50`
  - [ ] Restrict to last 48h via API filter (`submittedDate:[YYYYMMDD0000+TO+YYYYMMDD2359]`)
  - [ ] Parse Atom XML with `fast-xml-parser`
  - [ ] Map each `<entry>` to `CandidateRecord`:
    - title (collapse whitespace)
    - authors[]
    - abstract from `<summary>`
    - sourceUrl from `<id>`
    - pdfUrl: replace `abs/` with `pdf/` and append `.pdf`
    - sourcePaperId: extract arXiv id from `<id>`
    - publishedDate from `<published>`
    - venue: null (arXiv has no venue at submission time)
    - codeUrls: scan abstract for `github.com/...` links
- [ ] Implement a 3s rate limiter between calls (arXiv guidelines)
- [ ] Test with a recorded XML fixture under `tests/fixtures/sources/arxiv.xml`

### OpenReview client (`src/server/sources/openreview.ts`)

- [ ] Use OpenReview API v2: `https://api2.openreview.net/notes/search?term=computer+vision&limit=30&sort=cdate:desc`
- [ ] Filter to recent CV venues (CVPR / ICCV / ECCV / WACV workshops, ICLR submissions tagged CV) — implement a simple venueId allowlist
- [ ] Map response → `CandidateRecord`:
  - title, authors, abstract
  - sourceUrl: `https://openreview.net/forum?id={id}`
  - pdfUrl: `https://openreview.net/pdf?id={id}`
  - sourcePaperId: forum id
  - venue: extract from invitation/venue field
- [ ] Handle no-auth flow (V1 only reads public submissions)
- [ ] Test with a recorded JSON fixture

### Hugging Face client (`src/server/sources/huggingface.ts`)

- [ ] `https://huggingface.co/api/daily_papers` returns trending papers
- [ ] Each entry has `paper.id` (often arXiv id), `paper.title`, `paper.summary`, `paper.authors`, `paper.publishedAt`
- [ ] Map to `CandidateRecord`:
  - source: `HUGGINGFACE`
  - sourcePaperId: HF slug
  - sourceUrl: `https://huggingface.co/papers/{id}`
  - pdfUrl: derive from arXiv id if present (HF papers are arXiv mirrors)
  - venue: null
- [ ] Filter out non-CV papers using a tag/title heuristic (HF returns multi-domain)
- [ ] Test with a recorded JSON fixture

### Aggregator (`src/server/sources/index.ts`)

- [ ] `collectFromAllSources(opts: { targetCount: 30 }): Promise<CandidateRecord[]>`
- [ ] Run all three clients in `Promise.allSettled`
- [ ] Within-batch dedup: if same arXiv id appears in arXiv and HF, keep arXiv copy but merge `codeUrls` and `huggingface` source pointer (record both `paper_sources` later)
- [ ] Apply per-source quotas: 15 arXiv / 10 HF / 5 OpenReview, with overflow refilling from any source
- [ ] Trim or pad to exactly 30
- [ ] If a source fails, log and continue (PRD §21 reliability)

### Pipeline (`src/server/pipeline/`)

- [ ] `collect.ts` — `collect(runId)` calls aggregator, returns `CandidateRecord[]`
- [ ] `persist.ts` — `persistCandidates(runId, candidates)`:
  - For each candidate: run `findMatch` (Phase 1 dedup matcher)
  - If null: create Paper + PaperSource + PaperRunResult (`collection_status='new'`)
  - If match: ensure PaperSource for this source exists (else add); create PaperRunResult (`collection_status='existing'`); record PaperDuplicate row
- [ ] `runner.ts` (skeleton) —
  - `startRun(): runId`: creates DailyRun row with `status='collecting'`
  - In a detached `Promise.resolve().then(...)`:
    - call `collect(runId)`
    - call `persistCandidates(runId, candidates)`
    - update `status='completed'` (LLM stages added in Phase 3)
  - Catches errors → `status='failed'`, log

### API routes

- [ ] `src/app/api/runs/route.ts`:
  - POST → calls `runner.startRun()`, returns `{ id, status: 'collecting' }`
  - GET → returns last 20 runs with status (uses `runs.listByDate`)
- [ ] `src/app/api/runs/[id]/route.ts`:
  - GET → `{ id, status, candidateCount: persisted_so_far, createdAt, completedAt }`

### Tests

- [ ] `tests/fixtures/sources/arxiv.xml`, `openreview.json`, `huggingface.json` — copy from Phase 0.5 captures
- [ ] `tests/unit/sources/arxiv.test.ts` — parses fixture, asserts CandidateRecord shape, ≥10 entries
- [ ] `tests/unit/sources/openreview.test.ts` — same
- [ ] `tests/unit/sources/huggingface.test.ts` — same
- [ ] `tests/unit/sources/index.test.ts` — mocks each client, asserts within-batch dedup + quotas
- [ ] `tests/integration/collect-persist.test.ts` —
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

- [ ] `npm test` green
- [ ] `curl -X POST http://localhost:3000/api/runs` returns 200 with `{ id, status: 'collecting' }`
- [ ] After ~30s: `curl http://localhost:3000/api/runs/<id>` returns `{ status: 'completed' }` and `paper_run_results` has 30 rows for that runId
- [ ] Re-run: most candidates report `collection_status='existing'`; `paper_duplicates` has new rows; no duplicate Paper rows by `duplicate_fingerprint`
- [ ] `/library` page now lists ≥30 papers from real sources
- [ ] Logs show source-collection counts per source
- [ ] `plan/STATE.md` updated to point to Phase 2.5
- [ ] New entry appended at top of today's `plan/log/YYYY-MM-DD.md`

## Exit criteria

A real `POST /api/runs` reaches `status='completed'` with 30 persisted papers and visible dedup. No LLM yet.

## Risks / pitfalls

- **arXiv 429s** if many requests in a row — rate limiter is mandatory (3s).
- **OpenReview API drift** — the v2 API has had recent changes. Pin behavior to a version field in metadata; surface 4xx clearly.
- **HF returns non-CV** — heuristic filter must be permissive; better to over-include and let LLM screening downrank than to miss good papers.
- **PDF URL inference** — HF→arXiv mapping isn't always present. Allow `pdfUrl=null` and let Phase 3's `analyze-pdf` mark `pdf_analysis_status='unavailable'`.
- **Detached promise after request returns** — Next.js dev server may not keep the worker alive across HMR. Document the limitation; production-ready behavior is fine in `next start`.

# Phase 3 — Ranking Pipeline

**Goal:** Pipeline orchestrator runs the full PRD §12 two-stage flow on real DB data, persists evaluations, marks the top 10 `is_recommended=true`. Status row reflects each stage. Integration test (with mocked Anthropic) ends green.

## Why fourth

Phase 1 = persistence; Phase 2 = data; Phase 2.5 = prompts. This phase wires them together end-to-end.

## Goal checklist

### Stage 1 — Abstract Screening (`src/server/pipeline/screen.ts`)

- [ ] `screenAll(runId): Promise<void>`
  - [ ] Load 30 PaperRunResults for runId, join Paper
  - [ ] For each: build screening input (title, authors, abstract, venue, source)
  - [ ] **Reuse check**: if a `paper_evaluations` row exists with `paperId = X AND llm_prompt_version = SCREENING_PROMPT_VERSION AND evaluationStage = 'abstract_screening'`, skip the LLM call and reuse it (PRD §21)
  - [ ] Else: call `screenWithHaiku`, parse, write `paper_evaluations` row with all 5 dimension scores + total + summary + reason + tags
  - [ ] Concurrency-limited (`p-limit`, max 5 parallel) to respect rate limits
  - [ ] Update `daily_runs.status = 'screening'` at start
  - [ ] On per-paper failure: write `paper_evaluations` with `recommendation_decision='low_quality'`, total=0, log error; do not abort whole run
  - [ ] On batch end: update progress counter (custom column on daily_runs or in-memory map referenced by API route)

### Stage 2 — Full PDF Analysis (`src/server/pipeline/analyze-pdf.ts`)

- [ ] `analyzeTopPdfs(runId, k=15): Promise<void>`
  - [ ] Load screening evaluations for runId, sort by `total_score` desc, take top 15
  - [ ] Update `daily_runs.status = 'analyzing_pdfs'`
  - [ ] **Reuse check**: skip if `paper_evaluations` row exists with `evaluationStage='full_pdf' AND llm_prompt_version=PDF_PROMPT_VERSION AND pdfAnalysisStatus='success'`
  - [ ] For each: call `pdf.fetchPdfAsDocumentBlock(pdfUrl)`
    - If null (size cap / HTTP fail / `pdfUrl` is null): write `paper_evaluations` with `evaluationStage='full_pdf'` and `pdfAnalysisStatus` ∈ {'failed','unavailable'}; total falls back to Stage-1 total; no other field updates
    - Else: call `analyzeWithSonnet`, parse, write evaluation with updated dimension scores, strengths, weaknesses, table_figure_analysis, ranking_explanation
  - [ ] Concurrency-limited (max 3 parallel — PDF + Sonnet is heavier)
  - [ ] Per-paper failure handled like Stage 1

### Stage 3 — Ranking (`src/server/pipeline/rank.ts`)

- [ ] `finalizeRanking(runId): Promise<void>`
  - [ ] Update `daily_runs.status = 'ranking'`
  - [ ] For each PaperRunResult in run:
    - finalScore = Stage-2 total if `pdf_analysis_status='success'` exists, else Stage-1 total
    - Update `final_rank` (1..30, dense) by score desc
    - Update `is_recommended = final_rank <= 10`
  - [ ] Persist `paper_tags` from each evaluation's `tags[]` (only `LLM_GENERATED` source; dedup against existing)
  - [ ] Persist `paper_code_links` from any code URLs surfaced (LLM may extract `github.com/...` from PDF; merge with the codeUrls captured by sources at collection time)
  - [ ] Update `daily_runs.status = 'completed'`, `completedAt = now()`

### Orchestrator (`src/server/pipeline/orchestrator.ts`)

- [ ] `runPipeline(runId): Promise<void>`
  ```
  try:
    collect(runId)             # status: collecting
    persist(runId, candidates) # (collect+persist already exist from Phase 2)
    screen(runId)              # status: screening
    analyzePdfs(runId)         # status: analyzing_pdfs
    rank(runId)                # status: ranking → completed
  catch e:
    runs.updateStatus(runId, 'failed', { error: e.message })
    logger.error(e)
  ```
- [ ] Each stage updates status _before_ doing work so the UI sees the right label.
- [ ] If a stage throws unexpectedly (not per-paper failures), the whole run fails — failures inside a stage are caught and logged.

### Runner (`src/server/pipeline/runner.ts`) — upgraded from Phase 2 skeleton

- [ ] `startRun(): { id }` — creates DailyRun row with `status='running'`, returns id immediately
- [ ] Detached: `Promise.resolve().then(() => runPipeline(id))` so the API call returns fast
- [ ] Document: detached promise lifetime is bounded by Next.js server process; on dev HMR, in-flight runs may die — out of scope for V1.

### Progress reporting

- [ ] `daily_runs` table has the `status` column already from Phase 1.
- [ ] Add a lightweight `progress` JSON column? Or compute on-demand from row counts:
  - screened = count of `paper_evaluations` for runId where stage=abstract_screening
  - pdfs_analyzed = count where stage=full_pdf
- [ ] **Decision: compute on-demand** — no schema change.
- [ ] Update `src/app/api/runs/[id]/route.ts` to return:
  ```json
  {
    "id": "...",
    "status": "screening",
    "progress": { "screened": 17, "screened_total": 30, "pdfs_analyzed": 0, "pdfs_total": 15 },
    "createdAt": "...",
    "completedAt": null
  }
  ```

### Tests

- [ ] `tests/integration/pipeline.test.ts`:
  - [ ] Spin up real Postgres test schema
  - [ ] Mock Anthropic SDK (`vi.mock('@anthropic-ai/sdk')`) to return canned JSON for fixture papers — vary scores so top-10 selection is non-trivial
  - [ ] Mock source clients to return 30 fixed candidates (5 with no PDF URL → exercise unavailable path)
  - [ ] Run full `runPipeline(id)` to completion
  - [ ] Assert:
    - `daily_runs.status === 'completed'`
    - 30 rows in `paper_evaluations` with stage='abstract_screening'
    - ≤15 rows with stage='full_pdf' (some may be unavailable)
    - exactly 10 PaperRunResults with `is_recommended=true`
    - `final_rank` is 1..30 dense, no nulls, no duplicates
    - PaperRunResults sorted by final_rank match score desc
- [ ] `tests/integration/reuse.test.ts`:
  - [ ] Run pipeline twice on the same paper set
  - [ ] Second run: same paperIds → screening LLM is called 0 times for those (assert via mock spy)

## Files created in this phase

```
src/server/pipeline/screen.ts
src/server/pipeline/analyze-pdf.ts
src/server/pipeline/rank.ts
src/server/pipeline/orchestrator.ts
(src/server/pipeline/runner.ts updated, not new)
(src/app/api/runs/[id]/route.ts updated for progress)
tests/integration/pipeline.test.ts
tests/integration/reuse.test.ts
```

## Verification checklist

- [ ] `npm test` green (integration suite includes pipeline.test.ts)
- [ ] `curl -X POST http://localhost:3000/api/runs` → wait → status progresses through `collecting → screening → analyzing_pdfs → ranking → completed`
- [ ] In `psql`: `SELECT count(*) FROM paper_evaluations WHERE run_id=$1` → 30 (screening) + ≤15 (pdf)
- [ ] `SELECT count(*) FROM paper_run_results WHERE run_id=$1 AND is_recommended=true` → exactly 10
- [ ] Re-run on same data: log shows skipped LLM calls due to reuse
- [ ] Total cost (sum from logs) under PoC R4 projection
- [ ] `plan/STATE.md` updated to point to Phase 4
- [ ] New entry appended at top of today's `plan/log/YYYY-MM-DD.md`

## Exit criteria

Real run completes end-to-end with sensible top-10 ordering. Reuse logic prevents duplicate evaluations. Integration test green.

## Risks / pitfalls

- **Anthropic rate limits** — `p-limit` of 5 (Stage 1) and 3 (Stage 2) is conservative; tune after observing actual rates.
- **Stage-2 PDF download timeout** — 30s per PDF + 60s LLM = potential 90s/paper × 15 = 22 min. Concurrency 3 brings it to ~7 min. Watch this in real runs.
- **Total-score recompute** — the schema stores 5 dimension scores; `total` should be derived (computed column or trigger). For V1, recompute in `rank.ts` to be safe regardless of LLM arithmetic.
- **Aborted runs** — if process dies mid-run, `daily_runs.status` stuck at `screening`. Out of scope for V1; document a manual `UPDATE` recovery in README.
- **Reuse staleness** — `pdf_analysis_status='unavailable'` evaluations should NOT block re-attempt on next run (PDF might come back online); only reuse when status is `success`.

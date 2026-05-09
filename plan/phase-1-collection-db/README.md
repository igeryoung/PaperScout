# Phase 1 — Collection Database

**Goal:** All 9 entities from PRD §15-16 modeled in Prisma with proper FKs / indexes / enums. Dedup primitives work in unit tests. Thin repos isolate Prisma from pipeline. A manual ingest script proves end-to-end against the real DB. Minimal `/library` page lists what's stored.

## Why second (after Phase 0.5 gate)

The DB is "Phase 1" in PRD §24. With the PoC gate green, schema is the next foundation: nothing in Phases 2–5 can be built without it.

## Goal checklist

### Schema (`prisma/schema.prisma`)

Model exactly the 9 entities from PRD §15-16. Use enums where PRD specifies a fixed set.

- [ ] `Paper` — id (uuid, default), title, normalizedTitle (indexed), authors (Json), abstract?, venue?, publishedDate?, pdfUrl?, primarySource (enum), duplicateFingerprint (unique), createdAt, updatedAt
- [ ] `PaperSource` — id, paperId (FK), source (enum), sourceUrl, sourcePaperId?, pdfUrl?, metadata (Json?), collectedAt; unique `(source, sourcePaperId)` partial-where-not-null
- [ ] `DailyRun` — id, userId? (Uuid?, single-user V1 keeps null), domain (default `"computer_vision"`), runDate, triggerType (enum), candidateCount (default 30), recommendedCount (default 10), status (enum: running / collecting / screening / analyzing_pdfs / ranking / completed / failed), createdAt, completedAt?
- [ ] `PaperRunResult` — id, runId (FK), paperId (FK), candidateRank?, finalRank?, isRecommended (default false), collectionStatus (enum: new / existing / duplicate), createdAt; unique `(runId, paperId)`
- [ ] `PaperEvaluation` — id, paperId (FK), runId (FK), evaluationStage (enum: abstract_screening / full_pdf), llmModel, llmPromptVersion, summary?, keyContribution?, methodologySummary?, strengths (Json?), weaknesses (Json?), noveltyScore, methodologicalRigorScore, experimentalQualityScore, venueSourceCredibilityScore, authorInstitutionReputationScore, totalScore, rankingExplanation?, recommendationDecision (enum), pdfAnalysisStatus? (enum), tableFigureAnalysis (Json?), createdAt; index `(paperId, runId, evaluationStage)`
- [ ] `PaperFeedback` — id, paperId (FK), runId? (FK), userId?, starRating (Int 1-5, check constraint), comment?, createdAt, updatedAt; index `(paperId, runId)`
- [ ] `PaperTag` — id, paperId (FK), tag, source (enum: llm_generated / user_generated), createdAt; index `(tag)`, unique `(paperId, tag, source)`
- [ ] `PaperCodeLink` — id, paperId (FK), codeUrl, source?, createdAt; unique `(paperId, codeUrl)`
- [ ] `PaperDuplicate` — id, canonicalPaperId (FK), duplicatePaperId (FK), matchMethod (enum: title_hash / arxiv_id / openreview_id / source_url / normalized_title / fuzzy_title / pdf_url), confidence (Float), createdAt; index `(canonicalPaperId)`, `(duplicatePaperId)`

### Enums

- [ ] `Source` { ARXIV, OPENREVIEW, HUGGINGFACE }
- [ ] `RunStatus` { RUNNING, COLLECTING, SCREENING, ANALYZING_PDFS, RANKING, COMPLETED, FAILED }
- [ ] `TriggerType` { ON_DEMAND, SCHEDULED } (only ON_DEMAND used in V1)
- [ ] `CollectionStatus` { NEW, EXISTING, DUPLICATE }
- [ ] `EvaluationStage` { ABSTRACT_SCREENING, FULL_PDF }
- [ ] `RecommendationDecision` { RECOMMEND, STORE_ONLY, LOW_QUALITY }
- [ ] `PdfAnalysisStatus` { SUCCESS, FAILED, UNAVAILABLE }
- [ ] `TagSource` { LLM_GENERATED, USER_GENERATED }
- [ ] `MatchMethod` { TITLE_HASH, ARXIV_ID, OPENREVIEW_ID, SOURCE_URL, NORMALIZED_TITLE, FUZZY_TITLE, PDF_URL }

### Migration

- [ ] `npx prisma migrate dev --name init` — creates first migration
- [ ] Inspect generated SQL; confirm all unique/composite indexes appear
- [ ] `npx prisma studio` opens, all 9 tables visible

### Dedup primitives (`src/server/dedup/`)

- [ ] `normalize.ts` — `normalizeTitle(s)`: NFKD → strip diacritics → lowercase → strip non-alphanumeric except spaces → collapse whitespace → trim. Pure function. Tested.
- [ ] `fingerprint.ts` —
  - [ ] `makeFingerprint({ title, firstAuthor, year })`: SHA-256 of `${normalizedTitle}|${firstAuthorLower}|${year}`, hex
  - [ ] `arxivFingerprint(arxivId)` returns `arxiv:${arxivId}`
  - [ ] `openreviewFingerprint(orId)` returns `openreview:${orId}`
- [ ] `matcher.ts` — `findMatch(candidate, deps)` runs in PRD §17 order:
  1. arxivId match against PaperSource
  2. openreviewId match against PaperSource
  3. exact sourceUrl match
  4. exact normalized_title match against Paper
  5. fuzzy title match (Levenshtein normalized distance ≥0.92, plus author overlap ≥0.5) — use `fastest-levenshtein` lib
  6. pdfUrl match
     Returns `{ paper: Paper, method: MatchMethod, confidence: number } | null`

### Repos (`src/server/repos/`)

Thin Prisma wrappers, one file per entity. No business logic.

- [ ] `papers.ts` — `findByFingerprint`, `create`, `getById`, `listLibrary({ filters, cursor, limit })`
- [ ] `sources.ts` — `upsertForPaper`, `findByArxivId`, `findByOpenreviewId`, `findBySourceUrl`
- [ ] `runs.ts` — `create`, `getById`, `updateStatus(id, status, fields?)`, `listByDate`
- [ ] `runResults.ts` — `create`, `update(runId, paperId, fields)`, `findByRun`, `findRecommendedByRun`
- [ ] `evaluations.ts` — `create`, `findByPaperRunStage`, `findReusable(paperId, promptVersion, stage)`
- [ ] `feedback.ts` — `upsert(paperId, runId, fields)`, `findByPaper`
- [ ] `tags.ts` — `addAll(paperId, tags[], source)`, `listDistinct`
- [ ] `duplicates.ts` — `record({ canonicalPaperId, duplicatePaperId, method, confidence })`
- [ ] `codeLinks.ts` — `addAll(paperId, urls[])`

### Seed + ingest test

- [ ] `prisma/seed.ts` — 5 sample Paper records spanning sources, including one near-duplicate pair to exercise dedup
- [ ] Add `prisma.seed` config + `npm run db:seed` script
- [ ] `scripts/ingest-test.ts` — given an arXiv ID arg:
  1. Fetch arXiv metadata
  2. Build CandidateRecord
  3. Run dedup matcher
  4. If new: persist Paper + PaperSource; if duplicate: log match method, only attach new PaperSource if missing
  5. Print result JSON
- [ ] Run `tsx scripts/ingest-test.ts 2401.12345` (any real cs.CV id) twice — second run must report duplicate

### Library page (skeleton)

- [ ] `src/app/library/page.tsx` — Server Component. Fetches `papers` via repo. Renders a simple `<table>` with title / authors / source / created_at, sorted desc. No filters yet (those come in Phase 5).
- [ ] Confirm seeded papers display

### Tests

- [ ] `tests/unit/dedup/normalize.test.ts` — covers diacritics, punctuation, casing, whitespace
- [ ] `tests/unit/dedup/fingerprint.test.ts` — same input → same hash; arxiv override format
- [ ] `tests/unit/dedup/matcher.test.ts` — fixtures cover each match method (arxiv / normalized / fuzzy / null)
- [ ] `npm test` green

## Files created in this phase

```
prisma/schema.prisma                            (full)
prisma/migrations/<ts>_init/migration.sql       (generated)
prisma/seed.ts
scripts/ingest-test.ts
src/app/library/page.tsx
src/server/dedup/normalize.ts
src/server/dedup/fingerprint.ts
src/server/dedup/matcher.ts
src/server/repos/papers.ts
src/server/repos/sources.ts
src/server/repos/runs.ts
src/server/repos/runResults.ts
src/server/repos/evaluations.ts
src/server/repos/feedback.ts
src/server/repos/tags.ts
src/server/repos/duplicates.ts
src/server/repos/codeLinks.ts
src/types/domain.ts                             (shared TS types — Paper, Run, etc.)
tests/unit/dedup/normalize.test.ts
tests/unit/dedup/fingerprint.test.ts
tests/unit/dedup/matcher.test.ts
```

## Verification checklist

- [ ] `npx prisma migrate dev` clean (no warnings)
- [ ] `npx prisma studio` shows all 9 tables, all indexes/uniques visible
- [ ] `npm run db:seed` populates DB; `/library` page lists 5 rows
- [ ] `tsx scripts/ingest-test.ts <arxivId>` first run reports `new`, second run reports `duplicate` with method `arxiv_id`
- [ ] Triggering ingest on a paper whose normalized title matches a seed entry reports method `normalized_title`
- [ ] `npm test` exits 0; ≥3 dedup test files run
- [ ] `plan/STATE.md` updated to point to Phase 2
- [ ] New entry appended at top of today's `plan/log/YYYY-MM-DD.md`

## Exit criteria

All 9 entities + enums modeled, migration applied, dedup unit tests green, ingest script round-trips, library page lists seeded papers.

## Risks / pitfalls

- **Prisma JSON fields** are typed as `Prisma.JsonValue` — use a `unknown`-cast at repo boundaries; don't leak `Prisma.JsonValue` into pipeline code.
- **Composite uniques on nullable columns** — Postgres treats NULL as distinct, so `unique(source, sourcePaperId)` allows multiple NULLs. That's fine; we only dedup when both sides have the id.
- **`star_rating` check constraint** — Prisma doesn't natively support CHECK; add via raw migration SQL after `init`.
- **Fuzzy match cost** — Levenshtein over the whole `papers` table is O(N) per insert. Acceptable for V1 scale; revisit when N > ~100k.

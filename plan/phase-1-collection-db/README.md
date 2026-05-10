# Phase 1 — Collection Database

**Status:** Closed 2026-05-10. Most schema/repo/dedup work was pulled forward in Phase 0.5; Phase 1 added the thin shell needed to use that foundation interactively (seed, library page, `listLibrary` query) plus the carried backlog (SKILL.md tweaks).

**Goal:** All 9 entities from PRD §15-16 modeled in Prisma with proper FKs / indexes / enums. Dedup primitives work in unit tests. Thin repos isolate Prisma from pipeline. A manual ingest script proves end-to-end against the real DB. Minimal `/library` page lists what's stored.

## Why second (after Phase 0.5 gate)

The DB is "Phase 1" in PRD §24. With the PoC gate green, schema is the next foundation: nothing in Phases 2–5 can be built without it.

## Goal checklist

### Schema (`prisma/schema.prisma`) — *Phase 0.5 carried*

Model exactly the 9 entities from PRD §15-16. Use enums where PRD specifies a fixed set.

- [x] `Paper` — id (uuid, default), title, normalizedTitle (indexed), authors (Json), abstract?, venue?, publishedDate?, pdfUrl?, primarySource (enum), duplicateFingerprint (unique), createdAt, updatedAt
- [x] `PaperSource` — id, paperId (FK), source (enum), sourceUrl, sourcePaperId?, pdfUrl?, metadata (Json?), collectedAt; unique `(source, sourcePaperId)` partial-where-not-null
- [x] `DailyRun` — id, userId? (Uuid?, single-user V1 keeps null), domain (default `"computer_vision"`), runDate, triggerType (enum), candidateCount (default 30), recommendedCount (default 10), status (enum: running / completed / failed), createdAt, completedAt?
- [x] `PaperRunResult` — id, runId (FK), paperId (FK), candidateRank?, finalRank?, isRecommended (default false), collectionStatus (enum: new / existing / duplicate), createdAt; unique `(runId, paperId)`
- [x] `PaperEvaluation` — id, paperId (FK), runId (FK), evaluationStage (enum: abstract_screening / full_pdf), llmModel, llmPromptVersion, summary?, keyContribution?, methodologySummary?, strengths (Json?), weaknesses (Json?), noveltyScore, methodologicalRigorScore, experimentalQualityScore, venueSourceCredibilityScore, authorInstitutionReputationScore, totalScore, rankingExplanation?, recommendationDecision (enum), pdfAnalysisStatus? (enum), tableFigureAnalysis (Json?), createdAt; unique `(paperId, runId, evaluationStage)`; index `(paperId, llmPromptVersion)`
- [x] `PaperFeedback` — id, paperId (FK), runId? (FK), userId?, starRating (Int 1-5, check constraint added in follow-up migration), comment?, createdAt, updatedAt; index `(paperId)`
- [x] `PaperTag` — id, paperId (FK), tag, source (enum: llm_generated / user_generated), createdAt; index `(tag)`, unique `(paperId, tag, source)`
- [x] `PaperCodeLink` — id, paperId (FK), codeUrl, source?, createdAt; unique `(paperId, codeUrl)`
- [x] `PaperDuplicate` — id, canonicalPaperId (FK), duplicatePaperId (FK), matchMethod (enum: arxiv_id / openreview_id / source_url / normalized_title / fuzzy_title / pdf_url), confidence (Float), createdAt; index `(canonicalPaperId)`, `(duplicatePaperId)`

### Enums — *Phase 0.5 carried*

- [x] `Source` { ARXIV, OPENREVIEW, HUGGINGFACE }
- [x] `RunStatus` { RUNNING, COMPLETED, FAILED }
- [x] `TriggerType` { ON_DEMAND, SCHEDULED } (only ON_DEMAND used in V1)
- [x] `CollectionStatus` { NEW, EXISTING, DUPLICATE }
- [x] `EvaluationStage` { ABSTRACT_SCREENING, FULL_PDF }
- [x] `RecommendationDecision` { RECOMMEND, STORE_ONLY, LOW_QUALITY }
- [x] `PdfAnalysisStatus` { SUCCESS, FAILED, UNAVAILABLE }
- [x] `TagSource` { LLM_GENERATED, USER_GENERATED }
- [x] `MatchMethod` { ARXIV_ID, OPENREVIEW_ID, SOURCE_URL, NORMALIZED_TITLE, FUZZY_TITLE, PDF_URL }

### Migration — *Phase 0.5 carried*

- [x] `npm run prisma:migrate -- --name init` — applied 2026-05-10 → `prisma/migrations/20260509164406_init/`
- [x] All unique/composite indexes appear in generated SQL
- [x] All 9 tables visible (verified via successful ingest writing rows across them)

### Dedup primitives (`src/server/dedup/`) — *Phase 0.5 carried*

- [x] `normalize.ts` — `normalizeTitle(s)`: NFKD → strip diacritics → lowercase → strip non-alphanumeric except spaces → collapse whitespace → trim. Pure function. Tested.
- [x] `fingerprint.ts` —
  - [x] `makeFingerprint({ title, firstAuthor, year })`: SHA-256 of `${normalizedTitle}|${firstAuthorLower}|${year}`, hex
  - [x] `arxivFingerprint(arxivId)` returns `arxiv:${arxivId}`
  - [x] `openreviewFingerprint(orId)` returns `openreview:${orId}`
  - [x] `chooseFingerprint(...)` — order-preserving selector
- [x] `matcher.ts` — `findMatch(candidate, deps)` runs in PRD §17 order:
  1. arxivId match against PaperSource
  2. openreviewId match against PaperSource
  3. exact sourceUrl match
  4. exact normalized_title match against Paper
  5. pdfUrl match
  6. fuzzy title match (Levenshtein normalized distance ≥0.92, plus author overlap ≥0.5) — uses `fastest-levenshtein`

### Repos (`src/server/repos/`) — *Phase 0.5 carried; `listLibrary` added in Phase 1*

Thin Prisma wrappers, one file per entity. No business logic.

- [x] `papers.ts` — `findByFingerprint`, `findById`, `findByNormalizedTitle`, `findByPdfUrl`, `listRecentForFuzzy`, `create`, **`listLibrary({ limit?, cursor? })` (Phase 1)**
- [x] `sources.ts` — `findBySourcePaperId`, `findBySourceUrl`, `exists`, `create`
- [x] `runs.ts` — `create`, `findByIngestSourceDir`, `setStatus`, `listRecent`, `latestCompleted`
- [x] `runResults.ts` — `create`, `updateRanking`, `findByRun`, `findRecommendedByRun`
- [x] `evaluations.ts` — `upsert`, `findByPaperAndPromptVersion`
- [x] `feedback.ts` — `upsert`, `findByPaper` (manual upsert because the composite-unique includes nullable columns)
- [x] `tags.ts` — `addAll`, `listDistinct`
- [x] `duplicates.ts` — `create`
- [x] `codeLinks.ts` — `addAll`

### Seed (Phase 1)

- [x] `prisma/seed.ts` — 5 sample Paper records spanning ARXIV/OPENREVIEW/HUGGINGFACE, including a near-duplicate pair to exercise the matcher's `normalized_title` path on a future ingest
- [x] `prisma.seed` config in `package.json` + `npm run db:seed` script (now sources `.env`)
- [x] Seed is idempotent — re-run yields 0 inserts (verified: `5 created` then `0 created, 5 already present`)

### `scripts/ingest-test.ts` — **Superseded by Phase 0.5 R4**

The original Phase 1 plan included a single-arXiv-id round-trip CLI. Phase 0.5 R4 (`npm run ingest data/sample/`) already proved the round-trip end-to-end, and the arXiv-fetch path now lives in the `collect-papers` skill rather than a standalone script. Dropped from scope on 2026-05-10.

- [x] ~~`tsx scripts/ingest-test.ts <arxivId>` first run reports `new`, second run reports `duplicate`~~ → covered by `npm run ingest data/sample/` (first run exit 0, second run exit 1 with idempotency message)

### Library page (Phase 1)

- [x] `src/app/library/page.tsx` — Server Component (`import 'server-only'`, `dynamic = 'force-dynamic'`). Fetches `papers` via `papersRepo.listLibrary({ limit: 50 })`. Renders `<table>` with title / authors / source badge / publishedDate / createdAt, sorted desc by createdAt. Empty-state copy when zero rows. No filters, no pagination UI yet (Phase 5).
- [x] Confirm seeded papers display — verified `GET /library` HTTP 200 with all 8 stored rows + per-source badges; near-duplicate pair appears adjacent

### `src/types/domain.ts` — **Skipped**

Repos already export Prisma-generated types (`Paper`, `Source`, etc.). A parallel domain-types module would duplicate without value yet — defer until pipeline code needs a non-Prisma shape.

### Tests — *Phase 0.5 carried*

- [x] `tests/unit/dedup/normalize.test.ts` — covers diacritics, punctuation, casing, whitespace
- [x] `tests/unit/dedup/fingerprint.test.ts` — same input → same hash; arxiv override format
- [x] `tests/unit/dedup/matcher.test.ts` — fixtures cover each match method (arxiv / normalized / fuzzy / null)
- [x] `npm test` green

## Files created in this phase

```
prisma/seed.ts                                  (Phase 1 — new)
src/app/library/page.tsx                        (Phase 1 — new)
src/server/repos/papers.ts                      (Phase 1 — `listLibrary` added)
package.json                                    (Phase 1 — `prisma.seed` config + `db:seed` env wiring)
.claude/skills/collect-papers/SKILL.md          (Phase 1 — python xml.etree snippet for arXiv Atom parsing)
.claude/skills/evaluate-papers/SKILL.md         (Phase 1 — median-not-max note for mixed academic+industry rosters)

# Phase 0.5 carried (already on disk)
prisma/schema.prisma
prisma/migrations/20260509164406_init/migration.sql
src/server/dedup/{normalize,fingerprint,matcher}.ts
src/server/repos/{papers,sources,runs,runResults,evaluations,feedback,tags,duplicates,codeLinks}.ts
tests/unit/dedup/{normalize,fingerprint,matcher}.test.ts
```

## Verification checklist

- [x] `npx prisma migrate dev` clean (no warnings) — Phase 0.5 R4
- [x] All 9 tables + indexes/uniques visible (verified via `psql` + successful sample ingest)
- [x] `npm run db:seed` populates DB (`5 created`); re-run is idempotent (`0 created, 5 already present`)
- [x] `/library` page lists seeded rows — `curl GET /library` returns HTTP 200 with all stored papers + source badges
- [x] `npm run ingest data/sample/` first run exits 0; re-run exits 1 with idempotency message — Phase 0.5 R4 (supersedes `ingest-test.ts`)
- [x] Triggering ingest on a paper whose normalized title matches a stored entry would report method `normalized_title` — covered by `tests/unit/dedup/matcher.test.ts` and observable on the seeded near-duplicate pair (same `normalized_title`, distinct `duplicate_fingerprint`)
- [x] `npm test` exits 0; ≥3 dedup test files run
- [x] `plan/STATE.md` updated to point to Phase 2
- [x] New entry appended at top of today's `plan/log/2026-05-10.md`

## Exit criteria

All 9 entities + enums modeled, migration applied, dedup unit tests green, ingest round-trip proven (Phase 0.5 R4), library page lists seeded papers. **Closed 2026-05-10.**

## Risks / pitfalls

- **Prisma JSON fields** are typed as `Prisma.JsonValue` — use a `unknown`-cast at repo boundaries; don't leak `Prisma.JsonValue` into pipeline code.
- **Composite uniques on nullable columns** — Postgres treats NULL as distinct, so `unique(source, sourcePaperId)` allows multiple NULLs. That's fine; we only dedup when both sides have the id.
- **`star_rating` check constraint** — Prisma doesn't natively support CHECK; add via raw migration SQL when feedback writes land (Phase 5).
- **Fuzzy match cost** — Levenshtein over the whole `papers` table is O(N) per insert. Acceptable for V1 scale; revisit when N > ~100k.
- **`server-only` redux** — `prisma/seed.ts` runs under tsx, which throws on `import 'server-only'`. The seed and everything it transitively imports (db, env, repos, dedup) must NOT have the directive. The `/library` page IS allowed to use it because Next provides the `react-server` condition.

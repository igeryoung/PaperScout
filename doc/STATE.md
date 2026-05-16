# Current State

**Phase:** Phase 4 — Paper trend UI (closed 2026-05-11 → Phase 5). Highlight-figure extension shipped 2026-05-14.
**Current task:** Phase 5 kickoff (feedback + library filtering). Read-only viewer is live: `/`, `/runs/[id]`, `/papers/[id]`, plus a global `<AppHeader />`. Frozen Phase 2.5 reference is now also asserted via UI repo helpers. PaperCard + PaperDetail now show a highlight figure per Stage-2 paper (bytes streamed from `/api/papers/[id]/figure`).
**Last commit:** tracked in git; run `git log --oneline -1` for the current commit.
**Updated:** 2026-05-14

> For onboarding (read order, contract pointers, agent rules), start at [`doc/AGENT_GUIDE.md`](./AGENT_GUIDE.md).

## What's done in Phase 0.5

- **Data contract**: `data/sample/candidates.json` + `data/sample/evaluations.json` (3 papers each, one per source); field-by-field reference at [`doc/data-contract.md`](./data-contract.md)
- **Zod schemas**: `src/server/schema/{candidate,evaluation}.ts` with score bounds, sum=total refinement, stage/pdfAnalysisStatus consistency check
- **Prisma schema**: 9 entities per PRD §15-16, all enums, FKs, unique constraints, indexes; `prisma generate` succeeds
- **Dedup primitives**: `normalize.ts`, `fingerprint.ts` (SHA-256 of normalized fields, arXiv/OpenReview overrides), `matcher.ts` (PRD §17 order-preserving — arxiv → openreview → URL → normalized → pdf → fuzzy with author overlap)
- **Repos**: 9 thin Prisma wrappers (papers, sources, runs, runResults, evaluations, feedback, tags, duplicates, codeLinks)
- **Ingest script**: `scripts/ingest.ts` — CLI takes a run dir, validates JSON, dedups, upserts, computes `final_rank` + `is_recommended` (top 10), idempotent (delete-on-`--force`)
- **Validate CLIs**: `scripts/validate-{candidates,evaluations}.ts` + `npm run validate:*` scripts
- **Skills (skeletal)**: `.claude/skills/{collect-papers,evaluate-papers}/SKILL.md` with frontmatter + body referencing the sample data as contract
- **Tests**: `tests/unit/dedup/{normalize,fingerprint,matcher}.test.ts` + `tests/unit/schema/sample.test.ts` + `tests/unit/env/env.test.ts` (29 tests, all passing)
- **Build/lint**: `npm test` 29/29 green; `npm run lint` clean; `npm run build` green; `npx tsc --noEmit` clean
- **Plumbing**: `data/runs/` gitignored; `server-only` package + vitest alias to a stub; `tsx --env-file-if-exists` for ingest/migrate/studio scripts; Anthropic API env is not required because skills are invoked outside the app

## Phase 0.5 outcomes (2026-05-09)

- **R1 ✓** sample tests
- **R2 ✓** real `collect-papers` produced 5/5 valid arXiv records (`data/runs/2026-05-08-1743/candidates.json`)
- **R3 ✓** real `evaluate-papers` produced 5 evals; ActCam (top 1) Stage 2 SUCCESS with 4 strengths + 4 weaknesses
- **R4 ✓** (closed 2026-05-10) `npm run ingest data/sample/` → 3 papers, 3 recommended, exit 0; second invocation exited 1 with idempotency message. Required removing `import 'server-only'` from db, env, 9 repos, and 3 dedup files (see [`doc/ARCHITECTURE.md`](./ARCHITECTURE.md) §Conventions).
- **R5 ✓** wall-clock 8m 39s; tokens far under $2

Decision: **GO** to Phase 1.

## Phase 1 outcomes (2026-05-10)

- **Seed**: `prisma/seed.ts` inserts 5 papers across ARXIV/OPENREVIEW/HUGGINGFACE plus a near-duplicate pair (same normalized title, different first authors / arXiv ids → distinct fingerprints). Idempotent (`findByFingerprint` short-circuit). `package.json` `prisma.seed` config wired.
- **Repo**: `papersRepo.listLibrary({ limit, cursor })` added — id-as-cursor pagination shape so Phase 4/5 can extend without reshape.
- **Library page**: `src/app/library/page.tsx` — Server Component, `dynamic = 'force-dynamic'`, renders title/authors/source/publishedDate/createdAt; empty state when zero rows. Verified `GET /library` HTTP 200 with all rows + source badges.
- **Backlog cleared**: `collect-papers/SKILL.md` now ships a working `python3 xml.etree.ElementTree` snippet for arXiv Atom; `evaluate-papers/SKILL.md` adds the median-not-max note for mixed academic+industry rosters.
- **Scope decisions**: dropped `scripts/ingest-test.ts` (superseded by Phase 0.5 R4); skipped `src/types/domain.ts` (Prisma types suffice).

Decision: **GO** to Phase 2.

## Phase 2 outcomes (2026-05-10)

- **Source clients**: `src/server/sources/{arxiv,openreview,huggingface}.ts` each export a pure parser (`parseArxivAtom` / `parseOpenReview` / `parseHuggingFace`) and a `fetch*(deps?)` wrapper that takes an injected `fetch` for tests. CandidateRecord shape is reused from `src/server/schema/candidate.ts` (no new types file).
- **Aggregator**: `src/server/sources/index.ts` runs `Promise.allSettled` over the three clients, collapses cross-source duplicates by arXiv id / OpenReview id / normalized title (priority `ARXIV > OPENREVIEW > HUGGINGFACE`), unions `codeUrls`, applies quotas 15/10/5 with overflow refill, trims to 30. Continues on per-source failure with logged error.
- **Pipeline**: `src/server/pipeline/{collect,persist,runner}.ts`. `persist` mirrors `scripts/ingest.ts:111-222` plus a `seenPaperId` guard against fuzzy-match collisions in a single batch.
- **API**: `POST /api/runs` returns 202 + `{ id, status: 'RUNNING' }`, schedules `runCollectionInBackground(id)` via `after()` from `next/server`. `GET /api/runs/[id]` returns status + persisted count. `runsRepo.findById` and a `string|null` `ingestSourceDir` were added.
- **Tests**: `tests/unit/sources/{arxiv,openreview,huggingface,index}.test.ts` (29 tests) + `tests/integration/collect-persist.test.ts` (1 test, env-gated by `DATABASE_URL_TEST`, schema = `paperscout_test`). `npm test` excludes integration; `npm run test:integration` runs only it. Total `npm test` count: 58/58.
- **Live smoke**: first `POST /api/runs` against the dev DB → COMPLETED in ~1s, persisted new=26 / existing=4 / skipped=0 (4 fuzzy-matched seed/sample rows). Second POST → 0 new / 30 existing — full cross-run dedup. `/library` lists 38 papers (8 prior + 30 new), all with distinct `duplicate_fingerprint`.
- **Bug fixed during smoke**: `mergeAdditional` was pushing `other.additionalSources` entries that duplicated the primary's identity, causing `Unique constraint failed on (source, source_paper_id)` when persist created the additional source row. Fix: track the primary's identity in the seen-set before merging.
- **Live-captured fixtures**: `scripts/capture-source-fixtures.ts` (re-runnable) wrote `tests/fixtures/sources/{arxiv.xml,openreview.json,huggingface.json}` (123 KB / 113 KB / 273 KB).
- **Build/lint**: `npm test` 58/58 green; `npm run test:integration` 1/1 green (with DB) or 1 skipped (without); `npm run lint` clean; `npm run build` succeeds with `/api/runs` and `/api/runs/[id]` registered as dynamic routes.

Decision: **GO** to Phase 2.5.

## Phase 2.5 outcomes (2026-05-11)

- **Harness scripts**: `scripts/prompt-eval/lib.ts` (pure helpers: `BoundsSchema`, `FixtureManifestSchema`, `loadFixtures`, `buildCandidateMap` mirroring `scripts/ingest.ts:65-79`, `resolveJoinKey`/`recomputeTotal`/`applyBounds`/`checkRecordSchema`/`summarize`, all defensive over raw `unknown`), `build-fixture-run.ts`, `check-evaluations.ts`, `normalize-evaluations.ts`. CLIs are thin wrappers; tests import from `lib.ts`. BoundsSchema uses `z.partialRecord` (zod v4 made `z.record(enum, V)` require all enum keys).
- **Fixtures**: F1 SAM (arXiv:2304.02643), F2 EfficientFormerV2 (2212.08059), F3 ViT-22B (2302.05442), F4 SeaThru-NeRF (2304.07743), F5 The Dawn of LMMs / GPT-4V (2309.17421). Each has `metadata.json` (verbatim arXiv abstract + `_fixture` provenance with `metadataSourceUrl`/`authoredAt`/`frozen: true`) and `bounds.json`. Manifest is a first-class build output containing all join keys (primary + additionalSources).
- **NPM scripts**: `prompt:fixtures` / `prompt:check` / `prompt:normalize`. `.gitignore` excludes `/scripts/prompt-eval/runs/` and `/scripts/prompt-eval/fixtures/**/paper.pdf`.
- **Skill sync**: `.claude/skills/evaluate-papers/SKILL.md` → `.agents/skills/evaluate-papers/SKILL.md` byte-for-byte (only diff was the median-affiliation rule).
- **Tests**: `tests/unit/prompt-eval/{bounds,check-evaluations}.test.ts` (33 new tests). `npm test` 91/91 green; `npm run lint` clean; `npx tsc --noEmit` clean.
- **Manual loop**: converged on iteration 1. Run dir `scripts/prompt-eval/runs/2026-05-10-2142/`. Final scores F1=86 RECOMMEND, F3=73 RECOMMEND, F4=71 RECOMMEND, F2=61 STORE_ONLY, F5=30 LOW_QUALITY. F5's 45.6 MB PDF exceeded the 32 MB skill cap → correctly fell back to `pdfAnalysisStatus=UNAVAILABLE` with Stage-1 scoring preserved. 5/5 schema-valid, 5/5 bounds pass (better than ≥4/5 bar), 0 unmatched joinKeys. Coarse flags: F1 top-2 ✓, F5 bottom-2 ✓, F4 not-last ✓.
- **Reference outputs frozen**: `scripts/prompt-eval/reference/raw/2026-05-10-2142/{candidates,evaluations,fixtures-manifest}.json` + `scripts/prompt-eval/reference/normalized/F{1..5}.json`.
- **Deferred to follow-up**: teaching the skill to prefer a local run-dir PDF when present (would let F1/F4 re-tighten the `pdfAnalysisStatus` bound to `SUCCESS`-only); decision on whether to delete `.agents/skills/evaluate-papers/` (currently byte-identical to `.claude/`).

Decision: **GO** to Phase 3.

## Phase 3 outcomes (2026-05-11)

- **Helpers**: `scripts/ingest/lib.ts` — pure `recomputeTotal`, `chooseRankingScore`, `rankPapers`. Zero IO, fully unit-tested. Score selection: `FULL_PDF SUCCESS` > `ABSTRACT_SCREENING` > `FULL_PDF FAILED/UNAVAILABLE` (the F5 path falls into the last bucket and uses Stage-1 preserved scores). Tie-breakers documented: score desc → decision priority (`RECOMMEND > STORE_ONLY > LOW_QUALITY`) → `candidateOrder` → `paperId`.
- **`is_recommended` semantics**: combined `rank ≤ min(10, rankedCount) AND recommendationDecision === 'RECOMMEND'`. Resolves the README's internal conflict (top-N cap vs. decision-driven count). Sample → 2 recommended (2 RECOMMEND + 1 STORE_ONLY), fixture → 3 recommended (F1, F3, F4).
- **`scripts/ingest.ts` fixes**: replaced `sourcesRepo.exists(paperId, source)` with `existsIdentity({...})` on both call sites (alternate sources with same enum no longer skipped); added `seenPaperId` guard mirroring `persist.ts` (within-run fuzzy collisions count as `skipped` instead of failing the unique constraint); fail-fast on duplicate `(joinKey, stage)` and `(paperId, stage)` evaluations; fail-fast when any persisted paper has no evaluation. Log line now reports `skipped` count.
- **Schema**: migration `20260511144744_add_recommendation_reason` adds nullable `paper_evaluations.recommendation_reason TEXT`. `evaluationsRepo.upsert` widened; ingest passes `e.recommendationReason` through.
- **Tests**: `tests/unit/ingest/lib.test.ts` (14 tests). `tests/integration/ingest.test.ts` (6 tests, env-gated): sample, idempotency + `--force`, frozen Phase 2.5 reference (per-paper expectations + coarse flags), alternate-source `joinKey`, fuzzy-collision within run, fail-fast on missing evaluation. `npm test` 107/107; `npm run test:integration` 7/7; `npm run lint` clean; `npx tsc --noEmit` clean; `npm run build` green.
- **Deferred (out of Phase 3 scope per README)**: cross-run evaluation reuse via `evaluationsRepo.findReusable(...)`; app-side code-link extraction from PDFs; `--allow-partial` ingest mode; local-PDF support in the `evaluate-papers` skill; removing `.agents/skills/evaluate-papers/` duplicate.

Decision: **GO** to Phase 4.

## Phase 4 outcomes (2026-05-11)

- **View-model layer**: `src/server/lib/select-evaluation.ts` (DB-row analogue of `scripts/ingest/lib.ts:chooseRankingScore` plus `scoreTier()`); `src/server/repos/trends.ts` (`getRunSummary` → totals, recommendedCount, sources, top tags, score stats, pdfStatus breakdown); `runResultsRepo.findByRunWithDetail(runId, { recommendedOnly })` joins paper → evaluations + tags + sources + codeLinks; `papersRepo.findDetailById(id)` returns the full detail payload.
- **Pages**: `/` (server, force-dynamic) renders empty-state or trend dashboard with `TrendSummary` + `TrendTags` + `SourceMix` + top recommended cards + `/runs/[id]` link; `/runs/[id]` branches on `RUNNING/FAILED/COMPLETED` (no fake stages) and toggles via `?showAll=1`; `/papers/[id]` calls `findDetailById` and renders `<PaperDetail>` with `notFound()` fallback.
- **Components** (Server Components, no `'use client'` outside `error.tsx`): `app-header.tsx` (global, resolved server-side), `trend-summary.tsx`, `trend-tags.tsx` (capped 12, links to `/library?tags=...`), `source-mix.tsx` (segmented bar + legend), `paper-card.tsx`, `paper-detail.tsx` (guards every eval field so ABSTRACT_SCREENING-only papers render cleanly), `score-breakdown.tsx` (5 dimensions + total with tier colors). Shared formatters in `src/lib/format.ts`.
- **Root layout** renders `<AppHeader />` above every page (including `/library`); `metadata.title = 'PaperScout'`.
- **Loading + error**: top-level + per-route loading skeletons; `src/app/error.tsx` is the only Client Component.
- **vitest config**: `test:integration` gained `--no-file-parallelism` to serialize DB-touching files against the shared `paperscout_test` schema (truncate/insert collisions surfaced when a second file used the reference fixture).
- **Tests**: `tests/unit/server/select-evaluation.test.ts` (10 tests; every selection path + tier thresholds). `tests/integration/ui-repos.test.ts` (4 tests, env-gated) asserts `getRunSummary` / `findByRunWithDetail` / `findDetailById` against the frozen reference run. `npm test` 117/117 (was 107 + 10); `npm run test:integration` 11/11 (was 7 + 4). `npm run lint` clean; `npx tsc --noEmit` clean; `npm run build` green with `/`, `/runs/[id]`, `/papers/[id]` registered as ƒ dynamic routes.
- **Browser smoke** against current dev DB (Phase 2 collection-only — 30 papers, 0 evaluations): `/` returns 200 and renders "PaperScout trends" with the empty-recommended fallback message; `/library` 200; `/runs/<id>` and `?showAll=1` 200 with paper links; `/papers/<id>` 200 (renders abstract + links; score breakdown correctly absent because dev DB has no evaluations); `/papers/<bogus-uuid>` 200 in dev (body is the Next.js not-found page; production build will return 404). Visual mobile/desktop overlap not verified beyond responsive class structure.
- **Deferred to Phase 5**: feedback stars/comments; `/library?tags=...` route handler (chip links already emit the contract); cross-run evaluation reuse via `evaluationsRepo.findReusable(...)`; Playwright/visual regression for the new pages.

Decision: **GO** to Phase 5.

## Phase 4 extension — Highlight figures (2026-05-14)

- **Schema**: new `PaperFigure` sibling table (1:1 with Paper) — `image_bytes BYTEA`, `mime_type`, `caption`, `figure_label`, `page_number`, `source_pdf_url`, `extracted_at`. Migration `20260514154824_add_paper_figures`. Sibling table chosen so list/detail Paper queries do not hydrate ~200 KB per paper; bytes are only fetched via the dedicated API route.
- **Skill**: `evaluate-papers` Stage 2 picks one important figure (architecture > main result > teaser), records `{label, pageNumber, caption}`, renders the page to PNG via `pdftocairo` to `<run-dir>/figures/<safe-id>.png`. Best-effort — falls back to `figure = null` on missing tool or render failure.
- **Schema validation**: `EvaluationSchema.figure` is nullable + defaults null; only valid when `evaluationStage === 'FULL_PDF' && pdfAnalysisStatus === 'SUCCESS'`.
- **Ingest**: `scripts/ingest/figures.ts` reads the PNG (≤ 5 MB cap), upserts via new `figuresRepo`. Warn-but-not-fail on missing/oversize. Per-run summary line now reports `figures: <ok> ok / <missing> / <oversize> / <error>`.
- **Repos**: `figuresRepo.findBytesByPaperId` (bytes lookup for the route) + `figuresRepo.upsert` (ingest). `papersRepo.findDetailById` and `runResultsRepo.findByRunWithDetail` add `figure: { select: { caption, figureLabel, pageNumber, mimeType } }` — bytes intentionally excluded.
- **API route**: `GET /api/papers/[id]/figure` streams bytes with `Cache-Control: public, max-age=31536000, immutable`, 404 when missing.
- **UI**: `PaperCard` shows a 160×112 thumbnail at the right of the card (hidden on mobile), with placeholder slot when no figure; `PaperDetail` shows a centered figure (max-height 28rem) below the header with `<figcaption>`.
- **Fixtures**: `data/sample/evaluations.json` extended (entries 1 and 2 now carry a `figure` block); `data/sample/figures/{2605.12345,2605.09876}.png` are tiny valid PNGs for ingest tests.

## Open questions for the user

- (none) — Phase 4 closed; ready for Phase 5 (feedback + filtering) scoping.

## Next phase

See [`doc/roadmap/phase-5-feedback-library.md`](./roadmap/phase-5-feedback-library.md).

# Current State

**Phase:** Phase 2.5 — Prompt harness (closed 2026-05-11 → Phase 3)
**Current task:** Phase 3 kickoff (ranking pipeline). Reference outputs frozen; prompt behavior locked on the 5-fixture set.
**Last commit:** tracked in git; run `git log --oneline -1` for the current commit.
**Updated:** 2026-05-11

## What's done in Phase 0.5

- **Data contract**: `data/sample/candidates.json` + `data/sample/evaluations.json` (3 papers each, one per source) + `sample-paper-explained.md`
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
- **Plan files**: Phase 0 README boxes ticked for completed work; Phase 0.5 README rewritten for the new architecture and ticked

## Phase 0.5 outcomes (2026-05-09)

- **R1 ✓** sample tests
- **R2 ✓** real `collect-papers` produced 5/5 valid arXiv records (`data/runs/2026-05-08-1743/candidates.json`)
- **R3 ✓** real `evaluate-papers` produced 5 evals; ActCam (top 1) Stage 2 SUCCESS with 4 strengths + 4 weaknesses
- **R4 ✓** (closed 2026-05-10) `npm run ingest data/sample/` → 3 papers, 3 recommended, exit 0; second invocation exited 1 with idempotency message. Required removing `import 'server-only'` from db, env, 9 repos, and 3 dedup files (see plan/README.md decision log).
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
- **README supersedes**: see `plan/phase-2-sources/README.md` § "Supersedes / resolutions" — README's `'collecting'`/`'completed'` lowercase, standalone `CandidateRecord` type, detached-Promise pattern, abs→pdf URL swap, OpenReview venue allowlist, and 48h API filter were all replaced with what actually shipped.

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

## Open questions for the user

- (none) — Phase 2.5 closed; ready for Phase 3 (ranking pipeline) scoping.

## Read order for new agents

1. This file (`plan/STATE.md`)
2. Current phase README — `plan/phase-3-ranking/README.md`
3. Newest 1–2 files in `plan/log/` (sorted desc)
4. `scripts/prompt-eval/reference/normalized/F{1..5}.json` — frozen prompt-output reference from Phase 2.5
5. `~/.claude/plans/base-on-doc-prd-v1-md-build-serialized-sedgewick.md` (strategic plan with full architecture rationale)
6. `doc/PRD_v1.md` only when stuck on a requirement

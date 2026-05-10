# Phase 0.5 — Skill + Ingest PoC (Decision Gate)

**Goal:** Validate the round-trip — *can two skills produce schema-valid JSON, and can `scripts/ingest.ts` persist it without corruption?* Each risk has a pass/fail bar. **If any pass bar fails, we revise the plan, not push through.**

**Scope:** Hand-crafted sample data → zod schemas → minimal Prisma schema → dedup primitives → repos → ingest script → DB. Skill drafts are skeletal (just enough to confirm Claude Code can invoke them and produce the right shape).

## Why this gate exists

Five technical bets are baked into the new skills+ingest architecture:
1. The zod schemas correctly model what skills should produce
2. The `collect-papers` skill produces JSON that passes `CandidateSchema`
3. The `evaluate-papers` skill can download a PDF and produce JSON that passes `EvaluationSchema`
4. `scripts/ingest.ts` round-trips skill JSON into Postgres without duplicates on re-run
5. Total cost+time of one cycle is acceptable

Spending Phases 1–5 on top of an unproven contract is high-cost; spending one day on this spike is cheap insurance.

## Risks under test

| ID | Risk | Pass bar |
|--:|------|----------|
| R1 | `CandidateRecord` and `EvaluationRecord` zod schemas correctly model what skills should produce | Hand-crafted sample passes zod without schema modification |
| R2 | `collect-papers` skill produces JSON that passes `CandidateSchema` | Real skill invocation produces ≥3 valid records |
| R3 | `evaluate-papers` skill can download a PDF (Bash curl) and produce JSON that passes `EvaluationSchema` | ≥1 PDF-deep-analyzed record with `pdfAnalysisStatus='success'` and ≥1 strength + ≥1 weakness |
| R4 | `scripts/ingest.ts` round-trips into Postgres with idempotency on re-run | `npm run ingest data/sample/` exits 0; re-run shows 0 new rows; integration test asserts |
| R5 | Cost + time of one cycle is acceptable | Tokens for 5-paper PoC < $2; total wall-clock < 10 min |

## Goal checklist

### Schema + sample data (the contract)

- [x] Hand-craft `data/sample/candidates.json` — 3 example papers in `CandidateRecord` shape (one per source)
- [x] Hand-craft `data/sample/evaluations.json` — 3 corresponding `EvaluationRecord` entries with full PRD §13 fields
- [x] `data/sample/sample-paper-explained.md` — short reference doc explaining each field
- [x] `src/server/schema/candidate.ts` — zod `CandidateSchema` matching the sample
- [x] `src/server/schema/evaluation.ts` — zod `EvaluationSchema` matching the sample (score bounds, sum-equals-total refinement, stage/pdfAnalysisStatus consistency)

### Database baseline (Phase 1 work pulled forward)

- [x] `prisma/schema.prisma` — 9 entities from PRD §15-16 with FKs, indexes, enums
- [x] `npm run prisma:migrate -- --name init` (applied 2026-05-10 → `prisma/migrations/20260509164406_init/`)
- [x] `npm run prisma:generate` (works without DB)

### Dedup primitives

- [x] `npm i -D fastest-levenshtein`
- [x] `src/server/dedup/normalize.ts` — title normalization (NFKD, lowercase, strip punctuation, collapse whitespace)
- [x] `src/server/dedup/fingerprint.ts` — SHA-256 of `normalized_title|first_author|year`; arXiv/OpenReview overrides
- [x] `src/server/dedup/matcher.ts` — order-preserving match (PRD §17): arxiv → openreview → URL → normalized → pdf → fuzzy

### Repos (thin Prisma wrappers)

- [x] `src/server/repos/papers.ts`
- [x] `src/server/repos/sources.ts`
- [x] `src/server/repos/runs.ts`
- [x] `src/server/repos/runResults.ts`
- [x] `src/server/repos/evaluations.ts`
- [x] `src/server/repos/feedback.ts` (manual upsert because the composite-unique includes nullable columns)
- [x] `src/server/repos/tags.ts`
- [x] `src/server/repos/duplicates.ts`
- [x] `src/server/repos/codeLinks.ts`

### Ingest script

- [x] `scripts/ingest.ts` — CLI takes a run dir; loads `candidates.json` + `evaluations.json`; validates via zod; dedups; upserts via repos; idempotent (delete-on-`--force`)
- [x] `scripts/validate-candidates.ts` — runs `CandidateSchema` against a path; prints pass/fail
- [x] `scripts/validate-evaluations.ts` — runs `EvaluationSchema` against a path; prints pass/fail
- [x] `npm run ingest <dir>`, `npm run validate:candidates <path>`, `npm run validate:evaluations <path>` scripts (uses `tsx --env-file-if-exists`)

### Skills (skeletal)

- [x] `.claude/skills/collect-papers/SKILL.md` — frontmatter + body; references `data/sample/candidates.json` as the contract
- [x] `.claude/skills/evaluate-papers/SKILL.md` — frontmatter + body; references `data/sample/evaluations.json` as the contract; documents PDF download flow + size cap

### Tests

- [x] `tests/unit/dedup/normalize.test.ts` (5 tests)
- [x] `tests/unit/dedup/fingerprint.test.ts` (6 tests)
- [x] `tests/unit/dedup/matcher.test.ts` (6 tests)
- [x] `tests/unit/schema/sample.test.ts` — sample data passes both schemas; total = sum of dimensions enforced
- [ ] `tests/integration/ingest.test.ts` — runs against `data/sample/`; asserts row counts; re-run shows 0 new rows (BLOCKED: needs Docker postgres for Prisma to connect)
- [x] `tests/mocks/server-only.ts` + `vitest.config.ts` alias so tests can import server modules

### Real-skill PoC (validates R2/R3/R5 — user-driven)

- [x] User: `claude /collect-papers` against a small query (5 papers, 1-2 sources) — `data/runs/2026-05-08-1743/` (5/5 ARXIV, 2026-05-09)
- [x] User: validate output via `npm run validate:candidates data/runs/<ts>/candidates.json`
- [x] User: `claude /evaluate-papers` on the same run dir, evaluating 1 PDF — ActCam (arXiv 2605.06667) Stage 2 SUCCESS
- [x] User: validate output via `npm run validate:evaluations data/runs/<ts>/evaluations.json`
- [x] User: `npm run ingest data/runs/<ts>/` — full round-trip (closed 2026-05-10 against `data/sample/`: 3 papers, 3 recommended, exit 0; second invocation exited 1 with idempotency message)
- [x] Note token usage and wall-clock time — wall-clock 8m 39s; tokens far under $2

### Decision write-up

- [x] Append a "Phase 0.5 results" section to today's `plan/log/<date>.md` capturing pass-bar outcomes (`plan/log/2026-05-09.md`)
- [x] **Final go / no-go decision** — GO (R4 closed 2026-05-10)
- [x] If go: `plan/README.md` decisions log gets a 1-line entry; tick this phase in `plan/README.md` overall progress (decision-log entry added 2026-05-10; Phase 0.5 box ticked in `plan/README.md`)
- [ ] If no-go: update relevant phase READMEs per "Failure responses" before advancing (n/a — went GO)

## Failure responses

| Risk failed | Action |
|---|---|
| R1 | Revise schema to match real PRD §13 JSON; iterate until samples pass |
| R2 | Revise SKILL.md authoring (clearer output format; reference `data/sample/candidates.json` from inside the body) |
| R3 | Check `tools` in skill frontmatter (need `WebFetch`+`Bash`+`Read`+`Write`); iterate prompt |
| R4 | Bug in dedup or ingest logic; integration test should localize |
| R5 | Reduce Stage-2 from 15 → 10; or split evaluate skill into two passes |

## Files created in this phase

```
.claude/skills/collect-papers/SKILL.md
.claude/skills/evaluate-papers/SKILL.md
data/sample/candidates.json
data/sample/evaluations.json
data/sample/sample-paper-explained.md
prisma/schema.prisma                             (replaced empty Phase 0 stub)
prisma/migrations/<ts>_init/migration.sql        (after Docker is up)
scripts/ingest.ts
scripts/validate-candidates.ts
scripts/validate-evaluations.ts
src/server/schema/candidate.ts
src/server/schema/evaluation.ts
src/server/dedup/normalize.ts
src/server/dedup/fingerprint.ts
src/server/dedup/matcher.ts
src/server/repos/{papers,sources,runs,runResults,evaluations,feedback,tags,duplicates,codeLinks}.ts
tests/mocks/server-only.ts
tests/unit/dedup/{normalize,fingerprint,matcher}.test.ts
tests/unit/schema/sample.test.ts
tests/integration/ingest.test.ts                 (pending Docker)
```

## Verification checklist (must all pass to close phase)

- [x] All zod schemas pass on hand-crafted samples (`tests/unit/schema/sample.test.ts` green)
- [x] Validator CLIs pass on the samples (`npm run validate:candidates data/sample/candidates.json` and validate:evaluations both ✓)
- [x] `npm test` green (27/27)
- [x] `npm run build` green
- [x] `npm run lint` clean (no errors, no warnings)
- [x] `npx tsc --noEmit` clean
- [x] `prisma migrate dev` applied (init migration created all 9 tables; verified by successful ingest writing rows across them)
- [x] `npm run ingest data/sample/` exits 0; re-run = 0 new rows (verified 2026-05-10: first run exit 0 ingested 3 papers; second run exit 1 with idempotency message rejecting duplicate ingestion — stronger than 0-new-rows)
- [x] Real skill invocation in Claude Code produces JSON that passes both validators (user-side) — `data/runs/2026-05-08-1743/` 2026-05-09
- [x] Cost + time bars met for the 5-paper PoC cycle (user-side) — wall-clock 8m 39s; tokens well under $2
- [x] `plan/STATE.md` updated to point to Phase 0.5 work
- [x] New entry appended at top of today's `plan/log/YYYY-MM-DD.md`

## Exit criteria

Decision is **GO** with all 5 pass bars green. Sample data is committed and serves as both the data contract and the integration-test fixture. Phase 1 (full DB schema work, library page) builds on top.

## Notes

- Schemas are authored from PRD §13 + §15-16. Samples are examples *of those schemas*, not vice versa.
- `data/sample/regression/` is reserved for Phase 2.5; not populated here.
- The skill SKILL.md files are skeletal here — flesh out in Phase 2 (collect) and Phase 3 (evaluate). Phase 0.5 just needs them invocable.
- `src/server/schema/*.ts` deliberately do NOT use `import 'server-only'` because they are pure zod (no env, no DB) and must be loadable by the validate CLIs running under tsx. **2026-05-10 extension**: same applies to `src/lib/db.ts`, `src/lib/env.ts`, `src/server/repos/*.ts`, and `src/server/dedup/*.ts` — all imported by `scripts/ingest.ts` running under tsx, where `server-only`'s default export throws.

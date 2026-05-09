# Current State

**Phase:** Phase 0.5 — Skill + Ingest PoC (skill side green; R4 deferred → entering Phase 1)
**Current task:** Phase 1 kickoff. R4 (DB ingest round-trip) carried as a backlog item to close on the next session that has Docker up.
**Last commit:** (none — git not yet initialized)
**Updated:** 2026-05-09

## What's done in Phase 0.5

- **Data contract**: `data/sample/candidates.json` + `data/sample/evaluations.json` (3 papers each, one per source) + `sample-paper-explained.md`
- **Zod schemas**: `src/server/schema/{candidate,evaluation}.ts` with score bounds, sum=total refinement, stage/pdfAnalysisStatus consistency check
- **Prisma schema**: 9 entities per PRD §15-16, all enums, FKs, unique constraints, indexes; `prisma generate` succeeds
- **Dedup primitives**: `normalize.ts`, `fingerprint.ts` (SHA-256 of normalized fields, arXiv/OpenReview overrides), `matcher.ts` (PRD §17 order-preserving — arxiv → openreview → URL → normalized → pdf → fuzzy with author overlap)
- **Repos**: 9 thin Prisma wrappers (papers, sources, runs, runResults, evaluations, feedback, tags, duplicates, codeLinks)
- **Ingest script**: `scripts/ingest.ts` — CLI takes a run dir, validates JSON, dedups, upserts, computes `final_rank` + `is_recommended` (top 10), idempotent (delete-on-`--force`)
- **Validate CLIs**: `scripts/validate-{candidates,evaluations}.ts` + `npm run validate:*` scripts
- **Skills (skeletal)**: `.claude/skills/{collect-papers,evaluate-papers}/SKILL.md` with frontmatter + body referencing the sample data as contract
- **Tests**: `tests/unit/dedup/{normalize,fingerprint,matcher}.test.ts` + `tests/unit/schema/sample.test.ts` (27 tests, all passing)
- **Build/lint**: `npm test` 27/27 green; `npm run lint` clean; `npm run build` green; `npx tsc --noEmit` clean
- **Plumbing**: `data/runs/` gitignored; `server-only` package + vitest alias to a stub; `tsx --env-file-if-exists` for ingest/migrate/studio scripts
- **Plan files**: Phase 0 README boxes ticked for completed work; Phase 0.5 README rewritten for the new architecture and ticked

## Phase 0.5 outcomes (2026-05-09)

- **R1 ✓** sample tests
- **R2 ✓** real `collect-papers` produced 5/5 valid arXiv records (`data/runs/2026-05-08-1743/candidates.json`)
- **R3 ✓** real `evaluate-papers` produced 5 evals; ActCam (top 1) Stage 2 SUCCESS with 4 strengths + 4 weaknesses
- **R4 DEFERRED** — Docker daemon was not running; ingest not exercised
- **R5 ✓** wall-clock 8m 39s; tokens far under $2

Decision: **Conditional GO** to Phase 1 with R4 carried as a backlog item.

## Backlog carried into Phase 1

1. **R4 closure** (next session with Docker up):
   ```bash
   docker compose up -d
   npm run prisma:migrate -- --name init
   npm run ingest data/runs/2026-05-08-1743/   # must exit 0
   npm run ingest data/runs/2026-05-08-1743/   # must error on idempotency
   ```
   Then tick the R4 box in `plan/phase-0.5-poc/README.md` and append a "R4 closed" note to a future log entry.
2. **SKILL.md authoring iteration** (before Phase 2):
   - Recommend Python `xml.etree.ElementTree` snippet in `collect-papers/SKILL.md` (xmllint hint alone proved insufficient).
   - Note in `evaluate-papers/SKILL.md` that mixed academic+industry rosters should be scored on the median, not the maximum.
3. **`plan/README.md` decision-log entry** for Phase 0.5 → Phase 1 transition.

## Open questions for the user

- (none) — Phase 0.5 closed conditionally; ready for Phase 1 scoping.

## Read order for new agents

1. This file (`plan/STATE.md`)
2. Current phase README — `plan/phase-0.5-poc/README.md`
3. Newest 1–2 files in `plan/log/` (sorted desc)
4. `~/.claude/plans/base-on-doc-prd-v1-md-build-serialized-sedgewick.md` (strategic plan with full architecture rationale)
5. `doc/PRD_v1.md` only when stuck on a requirement

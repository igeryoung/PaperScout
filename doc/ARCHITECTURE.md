# Architecture & Conventions

This is the canonical reference for *how* PaperScout CV is built. Pair it with [`doc/STATE.md`](./STATE.md) (what's built today) and [`doc/PRD_v1.md`](./PRD_v1.md) (what we're building toward).

## Tech stack (locked)

| Concern         | Choice                                                              |
| --------------- | ------------------------------------------------------------------- |
| Runtime target  | Local single-user web app (no auth in V1; `user_id` nullable)       |
| Framework       | Next.js 16 (App Router) + TypeScript                                |
| Database        | PostgreSQL via Docker (`docker compose up`, host port 5435)         |
| ORM             | Prisma v6 (v7 dropped datasource `url` → too disruptive for V1)     |
| LLM execution   | **Claude Code skills** (`.claude/skills/`) — user invokes manually  |
| Ingest          | `scripts/ingest.ts` (`tsx`) — zod-validates + dedups + upserts      |
| PDF handling    | Inside `evaluate-papers` skill — `Bash curl` + Claude Code PDF read |
| UI model        | Read-only over runs (no Generate button in V1)                      |
| UI              | shadcn/ui + Tailwind v4                                             |
| Testing         | Vitest (unit/integration) + 1 Playwright smoke test                 |
| Skill iteration | Compare skill output against committed regression fixtures (Phase 2.5) |

## Conventions

These rules govern day-to-day edits. If a rule below is broken, an integration test or build will fail.

### File-scoped `server-only`

Pages, route handlers, and server components start with `import 'server-only'`. **Exception**: code imported by tsx CLIs omits the directive — `server-only`'s default export throws at module load under plain Node (no `react-server` condition).

The exception list (do **not** add `import 'server-only'` here):

- `src/server/schema/*.ts` — imported by `scripts/validate-{candidates,evaluations}.ts`
- `src/lib/db.ts`, `src/lib/env.ts` — imported by `scripts/ingest.ts`
- `src/server/repos/*.ts` (9 files) — same
- `src/server/dedup/*.ts` (3 files) — same

### Prompt versioning

`paper_evaluations.llm_prompt_version` is set by `scripts/ingest.ts` to `evaluate-papers:<sha256(SKILL.md body)>[:12]`. Prior rows with old hashes stay valid but won't be reused across prompt edits.

### Prisma boundary

No Prisma calls outside `src/server/repos/`. Ingest calls repos; repos call Prisma. Pages and route handlers go through repos too — no direct Prisma in `src/app/`.

### Skills produce JSON, not DB writes

The ingest script is the **only** DB writer. Re-running ingest on the same run dir is rejected unless `--force`.

### Sample data is the contract

`data/sample/{candidates,evaluations}.json` defines the shape both skills must mirror; zod schemas at `src/server/schema/` enforce it; tests assert it. Field-by-field reference: [`doc/data-contract.md`](./data-contract.md).

When the schema or the samples change, *all three roles update together* (schema + samples + tests).

### Errors

Ingest validation failures exit non-zero with a path-to-error message. Skill failures are visible in the user's Claude Code session — no app-level error surface for them.

## Implementation principles

### Structured errors and logs

- Server-side runtime code should use `src/lib/logger.ts` instead of raw `console.*`.
- Log entries should include a stable `event` field, plus identifiers needed for debugging such as `runId`, `source`, `sourcePaperId`, counts, status, and `err` when an exception is available.
- Error logs should be actionable and clean: describe what failed, include the boundary where it failed, and avoid dumping unrelated payloads.
- Expected partial outcomes should be logged as state, not treated as exceptions. For example, a source collection run may complete with fewer than the target candidate count when sources under-deliver.
- CLI scripts and one-off validation tools may keep concise `console.*` output when the output is the user interface of the command.

### Background collection

- Next.js route handlers that start background work should schedule it with `after()` from `next/server`.
- Route handlers that schedule collection work should declare a `maxDuration` matching the expected platform budget.
- Source clients should use bounded fetches. Phase 2 uses a 10 minute timeout so one stalled provider cannot leave the run open indefinitely.

### Integration tests

- Integration tests that require local services must be explicitly enabled with `RUN_INTEGRATION=1`.
- `DATABASE_URL_TEST` alone is not enough to opt in; this prevents stale local environment values from causing surprise failures.
- When integration tests are enabled, missing services should fail clearly rather than being silently ignored.
- `test:integration` runs with `--no-file-parallelism` because multiple files share the `paperscout_test` schema and would otherwise interleave truncates with another file's inserts.

## Ranking semantics

Concentrated in two pure helpers — keep them in sync if you touch either:

- **Script side**: `scripts/ingest/lib.ts` — `recomputeTotal`, `chooseRankingScore`, `rankPapers`.
- **UI side**: `src/server/lib/select-evaluation.ts` — DB-row analogue of `chooseRankingScore` plus `scoreTier()` (good/mid/weak at 70%/50%/0 ratios).

Rules:

- **Score selection precedence**: `FULL_PDF SUCCESS` > `ABSTRACT_SCREENING` > `FULL_PDF FAILED/UNAVAILABLE` (last bucket reuses Stage-1 preserved scores).
- **Tie-breakers** (deterministic, in order): score desc → `recommendationDecision` priority (`RECOMMEND > STORE_ONLY > LOW_QUALITY`) → `candidateOrder` → `paperId`.
- **`is_recommended`**: `rank ≤ min(10, rankedCount) AND recommendationDecision === 'RECOMMEND'`. Resolves the legacy "top-N cap vs. decision-driven count" conflict.

## Cross-phase verification matrix

| Layer      | Check                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Schema     | `prisma migrate dev` clean; `prisma studio` shows all tables with constraints            |
| Sources    | Vitest unit tests pass against fixtures; integration round-trips through Postgres        |
| Dedup      | Unit tests cover arxiv/openreview/title/fuzzy match paths                                |
| Prompts    | Phase 2.5 harness outputs schema-valid JSON; scores intuitive; frozen reference matches  |
| Pipeline   | Integration test ends with `status=COMPLETED`, exactly the expected `is_recommended` count |
| End-to-end | Playwright happy-path green; manual run on real arXiv produces sensible top-10           |
| Cost       | First real run logs token counts per stage; aim < $1/run with Haiku/Sonnet split          |

## V1 acceptance (from PRD §26)

- [ ] User clicks one button → receives ranked top-10 recent CV papers
- [ ] Each recommendation shows why it was recommended (LLM reason + score breakdown)
- [ ] User can rate each paper 1–5 stars and add an optional comment
- [ ] All 30 collected papers persist in DB (not just top-10) — future runs avoid re-processing
- [ ] Library page lets the user browse stored papers with filters (date / source / tag / score / rating / recommended)
- [ ] Total cost per run < $2 (per Phase 0.5 R4 pass bar)

## Out of scope (PRD §4 non-goals)

Multi-domain search • user-defined topics • automatic scheduled runs • personalized ranking • team collaboration • citation graph • literature review • Zotero/BibTeX export • full-text semantic search • global ranking model training.

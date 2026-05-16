# Agent Guide

You are an AI agent (or a new human contributor) picking up work on PaperScout CV. This file is your entry point. Read it once at the start of every session; everything else is linked from here.

## Where to start (read order)

1. **[`doc/STATE.md`](./STATE.md)** — what's built today, per-phase outcomes, current task.
2. **[`doc/roadmap/phase-5-feedback-library.md`](./roadmap/phase-5-feedback-library.md)** — the active forward plan (Phase 5). When a new phase starts, the relevant roadmap file replaces this entry.
3. **Newest 1–2 files in [`doc/log/`](./log/)** (sorted desc) — append-only decision records; useful for the *why* behind recent changes.
4. **`scripts/prompt-eval/reference/normalized/F{1..5}.json`** — frozen Phase 2.5 prompt-output reference; locked in by `tests/integration/ingest.test.ts` and `tests/integration/ui-repos.test.ts`. Any change to prompts, schema, or ingest must keep these green.
5. **`scripts/ingest/lib.ts`** + **`src/server/lib/select-evaluation.ts`** — ranking + best-eval semantics shared by the ingest script and the UI. Keep them in sync.
6. **`src/server/repos/trends.ts`** — view-model entry point for any trend / aggregation work.
7. **[`doc/ARCHITECTURE.md`](./ARCHITECTURE.md)** — full conventions, principles, ranking rules, V1 acceptance.
8. **[`doc/PRD_v1.md`](./PRD_v1.md)** — only when stuck on a requirement.
9. **`~/.claude/plans/base-on-doc-prd-v1-md-build-serialized-sedgewick.md`** — external strategic plan with the full architecture rationale. Not in repo.

## Where contracts live

| Contract                        | Authoritative source                                                  |
| ------------------------------- | --------------------------------------------------------------------- |
| Skill output shape              | `data/sample/{candidates,evaluations}.json` (see [`doc/data-contract.md`](./data-contract.md)) |
| Zod enforcement of skill output | `src/server/schema/{candidate,evaluation}.ts`                         |
| Prompt version (hashed)         | `.claude/skills/evaluate-papers/SKILL.md` body                        |
| Frozen prompt-output reference  | `scripts/prompt-eval/reference/normalized/F{1..5}.json`               |
| DB schema                       | `prisma/schema.prisma` + `prisma/migrations/`                         |
| Ranking semantics (script side) | `scripts/ingest/lib.ts`                                               |
| Ranking semantics (UI side)     | `src/server/lib/select-evaluation.ts`                                 |
| Aggregations / view models      | `src/server/repos/trends.ts`                                          |

## Agent rules of engagement

Full rationale lives in [`doc/ARCHITECTURE.md`](./ARCHITECTURE.md); below is the one-liner version.

- **Skills produce JSON only.** `scripts/ingest.ts` is the only DB writer.
- **Prisma calls only inside `src/server/repos/`.** No exceptions in pages, route handlers, or scripts.
- **Sample data is the contract.** If you change the schema, regenerate samples AND fixtures in the same change.
- **`import 'server-only'` is forbidden** in modules also imported by tsx CLIs (`src/server/schema/`, `src/server/repos/`, `src/server/dedup/`, `src/lib/db.ts`, `src/lib/env.ts`). The directive throws at load time under plain Node.
- **Integration tests are gated** by `RUN_INTEGRATION=1` + `DATABASE_URL_TEST`. `DATABASE_URL_TEST` alone is not enough.
- **`test:integration` runs serially** (`--no-file-parallelism`) — shared `paperscout_test` schema means truncate/insert can interleave.
- **Logs are structured** via `src/lib/logger.ts` with stable `event` field. No raw `console.*` in runtime server code.
- **Background work in route handlers** uses `after()` from `next/server` with a declared `maxDuration`.

## Doc index

```
doc/
├── README.md           — human-facing index
├── PRD_v1.md           — product requirements
├── STATE.md            — current implementation truth
├── ARCHITECTURE.md     — tech stack, conventions, ranking rules
├── AGENT_GUIDE.md      — this file
├── data-contract.md    — field-by-field for data/sample/*.json
├── roadmap/
│   └── phase-5-feedback-library.md   — active forward plan
└── log/                — append-only decision records (YYYY-MM-DD.md)
```

## When you finish a task

- Update [`doc/STATE.md`](./STATE.md) only if the *current task* or *what's done* changed at a phase-outcome level. Small fixes don't belong there.
- Append (don't edit older entries) a new `doc/log/YYYY-MM-DD.md` file when closing a phase or making a non-trivial architectural decision. One file per work day.
- Tick boxes in the active roadmap file when its checklist items land.
- Run `npm run lint`, `npx tsc --noEmit`, `npm test`, and (with DB) `RUN_INTEGRATION=1 DATABASE_URL_TEST=… npm run test:integration` before declaring a task done.

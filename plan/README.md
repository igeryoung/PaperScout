# PaperScout CV — Local Implementation Plan

Local, actionable plan with checkbox tracking per phase. The full approved narrative plan lives at `~/.claude/plans/base-on-doc-prd-v1-md-build-serialized-sedgewick.md`; this folder turns it into a TODO board.

## How to use this folder

- **Tick checkboxes** as work progresses. The top-level boxes here mirror the per-phase boxes inside each sub-plan.
- **Each sub-plan** has: goals, task checkboxes, files-to-touch list, verification checkboxes, exit criteria.
- **Do NOT skip Phase 0.5** — it's a decision gate. Failing pass bars there triggers plan revisions, not pushing through.
- Keep each plan file under 500 lines. Split into a sibling file inside the same phase folder when growing.

## Tech stack (locked in by AskUserQuestion answers, then re-pivoted to skills+ingest)

| Concern        | Choice                                                          |
| -------------- | --------------------------------------------------------------- |
| Runtime target | Local single-user web app (no auth in V1; `user_id` nullable)   |
| Framework      | Next.js 16 (App Router) + TypeScript                            |
| Database       | PostgreSQL via Docker (local `docker compose up`)               |
| ORM            | Prisma v6                                                       |
| LLM execution  | **Claude Code skills** (`.claude/skills/`) — user invokes manually |
| Ingest         | `scripts/ingest.ts` (`tsx`) — zod-validates + dedups + upserts  |
| PDF handling   | Inside `evaluate-papers` skill — `Bash curl` + Claude Code PDF read |
| UI model       | Read-only over runs (no Generate button)                        |
| UI             | shadcn/ui + Tailwind v4                                         |
| Testing        | Vitest (unit/integration) + 1 Playwright smoke test             |
| Skill iteration | Compare skill output against committed regression fixtures (Phase 2.5) |

## Overall progress

- [ ] **Phase 0 — Bootstrap** → [phase-0-bootstrap/](./phase-0-bootstrap/README.md)
- [ ] **Phase 0.5 — PoC (decision gate)** → [phase-0.5-poc/](./phase-0.5-poc/README.md)
- [ ] **Phase 1 — Collection database** → [phase-1-collection-db/](./phase-1-collection-db/README.md)
- [ ] **Phase 2 — Source collection** → [phase-2-sources/](./phase-2-sources/README.md)
- [ ] **Phase 2.5 — Prompt harness** → [phase-2.5-prompt-harness/](./phase-2.5-prompt-harness/README.md)
- [ ] **Phase 3 — Ranking pipeline** → [phase-3-ranking/](./phase-3-ranking/README.md)
- [ ] **Phase 4 — Recommendation UI** → [phase-4-ui/](./phase-4-ui/README.md)
- [ ] **Phase 5 — Feedback & library** → [phase-5-feedback-library/](./phase-5-feedback-library/README.md)

## Phase dependencies

```
Phase 0 ─┐
         ├─► Phase 0.5 (gate) ─► Phase 1 ─► Phase 2 ─► Phase 2.5 ─► Phase 3 ─► Phase 4 ─► Phase 5
         │                                                                                  │
         └──────────────────────── tests scaffold reused at each phase ─────────────────────┘
```

Phase 2.5 may be pulled forward into Phase 0.5 if R3 (prompt quality) reveals more iteration is needed than expected.

## Final V1 acceptance (from PRD §26)

- [ ] User clicks one button → receives ranked top-10 recent CV papers
- [ ] Each recommendation shows why it was recommended (LLM reason + score breakdown)
- [ ] User can rate each paper 1–5 stars and add an optional comment
- [ ] All 30 collected papers persist in DB (not just top-10) — future runs avoid re-processing
- [ ] Library page lets the user browse stored papers with filters (date / source / tag / score / rating / recommended)
- [ ] Total cost per run < $2 (per Phase 0.5 R4 pass bar)

## Cross-phase verification (referenced from each phase)

| Layer      | Check                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------- |
| Schema     | `prisma migrate dev` clean; `prisma studio` shows all 9 tables with constraints          |
| Sources    | Vitest unit tests pass against fixtures; `scripts/ingest-test.ts` round-trips            |
| Dedup      | Unit tests cover arxiv/openreview/title/fuzzy match paths                                |
| Prompts    | Phase 2.5 harness outputs schema-valid JSON; scores intuitive                            |
| Pipeline   | Integration test (mocked Anthropic) ends with `status=completed`, exactly 10 recommended |
| End-to-end | Playwright happy-path green; manual run on real arXiv produces sensible top-10           |
| Cost       | First real run logs token counts per stage; aim < $1/run with Haiku/Sonnet split         |

## Out of scope (PRD §4 non-goals)

Multi-domain search • user-defined topics • automatic scheduled runs • personalized ranking • team collaboration • citation graph • literature review • Zotero/BibTeX export • full-text semantic search • global ranking model training.

## Conventions

- **File-scoped server-only**: most files under `src/server/` start with `import 'server-only'`. **Exception**: `src/server/schema/*.ts` are pure zod (no DB, no env) and are imported by validate CLIs running under tsx — they omit the directive deliberately.
- **Prompt version**: `llm_prompt_version` in `paper_evaluations` is set by `scripts/ingest.ts` to `evaluate-papers:<sha256(SKILL.md body)>[:12]`. Prior rows with old hashes stay valid but won't be reused.
- **Prisma**: no Prisma calls outside `src/server/repos/`. Ingest calls repos, repos call Prisma.
- **Skills produce JSON, not DB writes.** The ingest script is the only DB writer. Re-running ingest on the same run dir is rejected unless `--force`.
- **Sample data is the contract.** `data/sample/{candidates,evaluations}.json` defines the shape both skills must mirror; zod schemas at `src/server/schema/` enforce it; tests assert it.
- **Errors**: ingest validation failures exit non-zero with a path-to-error message. Skill failures are visible in the user's Claude Code session.

## Notes / decisions log

Append-only. Date format YYYY-MM-DD.

- 2026-05-07 — Plan finalized and approved. Tech stack locked. Phase 0.5 PoC added as decision gate before Phase 1.
- 2026-05-07 — Initial `create-next-app` attempt blocked by existing `doc/` + `.omc/` dirs. Used `/tmp/pcs-scaffold-tmp` subdir + `cp -a` instead.
- 2026-05-07 — Pinned Prisma to v6 (v7 dropped datasource `url` → too disruptive for V1).
- 2026-05-08 — Architecture pivot: server-side LLM pipeline → manual Claude Code skills + ingest script. Strategic plan rewritten; per-phase READMEs updated.
- 2026-05-08 — Phase 0.5 deliverables built (DB-side complete; awaiting Docker for migrations + real-skill PoC).

# PaperScout CV

AI-powered computer-vision paper collection and ranking system. Collects 30 recent CV papers per run from arXiv / OpenReview / Hugging Face, runs a two-stage LLM pipeline (Haiku abstract screening → Sonnet full-PDF analysis), and surfaces a ranked top-10 with explanations.

V1 is a local single-user web app. See `doc/PRD_v1.md` for the full product requirements and `plan/` for the implementation TODO board.

## Quick start

```bash
# 1. Database
docker compose up -d
docker compose ps                # postgres should be healthy

# 2. Env
cp .env.example .env.local
# edit DATABASE_URL only if your local Postgres settings differ

# 3. Install + run
npm install
npm run dev                      # http://localhost:3000

# 4. Tests
npm test
```

## Project layout

- `src/app/` — Next.js App Router pages + API routes
- `src/components/` — React components (shadcn/ui + Tailwind)
- `src/server/` — server-only modules (pipeline, sources, LLM, dedup, repos)
- `src/lib/` — shared client+server utilities (db, env, logger)
- `prisma/` — schema, migrations, seed
- `scripts/` — PoC scripts (`poc/`), prompt harness (`prompt-eval/`), manual ingest (`ingest-test.ts`)
- `tests/` — Vitest (`unit/`, `integration/`, `fixtures/`) + Playwright (`e2e/`)
- `doc/` — PRD
- `plan/` — implementation TODO board (`README.md` + `STATE.md` + `log/` + per-phase READMEs)

## How it works (V1)

1. Click **Generate Today's Recommendations**.
2. Sources collect ~30 candidates → deduplicate → persist all 30.
3. Stage 1 (Haiku): screen all 30 abstracts, produce 100-pt scores.
4. Stage 2 (Sonnet): full-PDF analysis on top 15 (native Claude PDF input).
5. Rank, mark top-10 `is_recommended`. UI shows the ranked list.
6. User rates 1–5 stars + optional comment.

## Known limitations (V1)

- Single user, no auth.
- On-demand only (no scheduled runs).
- In-process background runner — runs may die on dev-server HMR.
- Feedback is stored but does not influence ranking.

See `doc/PRD_v1.md` §4 (Non-Goals) and §25 for what is intentionally deferred.

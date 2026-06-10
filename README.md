# PaperScout CV

AI-powered computer-vision paper collection and ranking system. Collects 30 recent CV papers per run from arXiv / OpenReview / Hugging Face, runs a two-stage LLM pipeline (Haiku abstract screening → Sonnet full-PDF analysis), and surfaces a ranked top-10 with explanations.

V1 is a local single-user web app. See [`doc/`](./doc/) for product requirements, current state, architecture, roadmap, and decision log. Start at [`doc/AGENT_GUIDE.md`](./doc/AGENT_GUIDE.md) (new contributors) or [`doc/STATE.md`](./doc/STATE.md) (for status).

## Quick start

```bash
# 1. Env
cp .env.example .env.local
# set DATABASE_URL to the Railway Postgres connection string
# fill Google OAuth variables if you want to use login locally

# 2. Install + migrate + run
npm install
npm run prisma:migrate
npm run dev                      # http://localhost:3050

# 3. Tests
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
- `doc/` — PRD, current state, architecture, agent guide, roadmap, decision log

## How it works (V1)

1. Click **Generate Today's Recommendations**.
2. Sources collect ~30 candidates → deduplicate → persist all 30.
3. Stage 1 (Haiku): screen all 30 abstracts, produce 100-pt scores.
4. Stage 2 (Sonnet): full-PDF analysis on top 15 (native Claude PDF input). Every narrative field (summary, methodology, strengths/weaknesses, ranking note, figure caption, …) is emitted bilingually as `{ en, "zh-TW" }`.
5. Rank, mark top-10 `is_recommended`. UI shows the ranked list with a header locale switcher (English / 繁體中文).
6. User rates 1–5 stars + optional comment.

## Google Login

PaperScout uses Google as the only login provider and Railway Postgres as the
application database. Configure these values in `.env.local`:

- `DATABASE_URL` — `postgresql://postgres:<PASSWORD>@nozomi.proxy.rlwy.net:28727/railway`
- `APP_BASE_URL` — local default is `http://localhost:3050`
- `AUTH_SECRET` — at least 32 random characters
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The Google OAuth redirect URI must be:

```text
http://localhost:3050/api/auth/google/callback
```

Auth API surface:

```text
GET    /api/auth/google
GET    /api/auth/google/callback
POST   /api/auth/logout
GET    /api/users/me
GET    /api/sessions/current
DELETE /api/sessions/current
GET    /api/sessions
DELETE /api/sessions/:id
```

Sessions are stored server-side in Postgres and the browser receives only an
HTTP-only session cookie.

## Known limitations (V1)

- Google login is implemented, but workspace ownership features are still in the Phase 6 roadmap.
- On-demand only (no scheduled runs).
- In-process background runner — runs may die on dev-server HMR.
- Feedback is stored but does not influence ranking.

See `doc/PRD_v1.md` §4 (Non-Goals) and §25 for what is intentionally deferred.

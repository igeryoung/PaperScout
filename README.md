# PaperScout

A local, single-user system for discovering and ranking recent AI/ML research papers. It has two halves:

- **The reader** — a Next.js web app that browses the ranked, bilingual (English / 繁體中文) paper library: home feed, all-papers search, paper detail with a highlight figure and score breakdown, personal lists, likes, reading status, notes, and comments.
- **The content pipeline** — Claude Code skills plus a desktop **Paper Factory** GUI that collect candidates, evaluate them with a two-stage LLM pipeline (abstract screening → full-PDF analysis), and ingest the results into Postgres.

Nothing runs on a schedule — every collection/evaluation/ingest cycle is user-triggered. See [`docs/`](./docs/) for product requirements, architecture, roadmap, and the decision log. Start at [`docs/AGENT_GUIDE.md`](./docs/AGENT_GUIDE.md) (new contributors) or [`docs/STATE.md`](./docs/STATE.md) (status).

## Quick start

```bash
# 1. Env
cp .env.example .env.local
# set DATABASE_URL to the Railway Postgres connection string
# fill the Google OAuth variables if you want to log in locally

# 2. Install + migrate
npm install
npm run prisma:migrate

# 3. Run (port 3050 matches the OAuth redirect URI below)
npm run dev -- -p 3050           # http://localhost:3050

# 4. Tests
npm test                         # Vitest unit (integration excluded)
npm run test:integration         # RUN_INTEGRATION=1 + DATABASE_URL_TEST
npm run test:e2e                 # Playwright
```

## How the pipeline works

One cycle = **collect candidates → evaluate → ingest into Postgres → browse in the web app**. There are two front doors, both converging on the same `scripts/ingest.ts` writer (the only thing that writes to the app DB):

1. **Collect / crawl.** Invoke a Claude Code skill to produce a `CandidateRecord[]` JSON:
   - `collect-papers` — ~30 recent computer-vision papers across arXiv / OpenReview / Hugging Face.
   - `crawl-conference-list` — accepted papers from a named conference (NeurIPS / ICML / ICLR / AAAI via OpenReview; CVPR / ICCV / WACV / ACCV / ECCV / ACM MM via Open Access).
   - `collect-pdf-metadata` — resolve DB metadata for a folder of PDFs you already have (Semantic Scholar / arXiv lookup) so they can be uploaded directly.
2. **Evaluate.** `evaluate-papers` (or the lighter `evaluate-papers-lite`) runs Stage 1 abstract screening on every candidate, Stage 2 full-PDF analysis on the top ~15, picks a highlight figure, and emits `evaluations.json`. Every narrative field (summary, methodology, strengths/weaknesses, ranking note, figure caption, …) is bilingual `{ en, "zh-TW" }`.
3. **Ingest.** `npm run ingest data/runs/<dir>` zod-validates both files, runs the dedup cascade (arxivId → openreviewId → URL → normalized title → pdfUrl → fuzzy), upserts papers/sources/evaluations/tags/figures, recomputes scores, ranks, and marks the top recommendations.

The **Paper Factory** desktop GUI (PySide6) wraps this with a human-in-the-loop workflow — PDF truncation, figure cropping, eval review (pass/reject), and a Live DB tab that edits the production records in place. See [`paper_factory/README.md`](./paper_factory/README.md). For the skill-only CLI flow, see [`COLLECT.md`](./COLLECT.md).

## The web app

A read-only viewer over the ingested data, plus per-user features once you log in with Google:

- `/` — home feed with hero search, topic chips, and tabs (recommended / trending / latest / high-score).
- `/papers` — all-papers page with full-text search, tag filter, and grouped listing.
- `/papers/[id]` — paper detail: bilingual summary, score breakdown, highlight figure, code links, comments.
- `/library` — personal lists/collections, likes, read-later, reading status, notes, and view history.
- `/runs/[id]` — per-run trend dashboard (totals, source mix, top tags, recommended cards).
- `/account` plus static pages: `/about`, `/faq`, `/how-it-works`, `/privacy`, `/terms`.
- A global header locale switcher toggles English / 繁體中文 (default `zh-TW`); evaluation text is bilingual end-to-end.

## Project layout

- `src/app/` — Next.js App Router pages + API routes
- `src/components/` — React components (shadcn/ui + Tailwind v4)
- `src/server/` — server-only modules: `sources/`, `pipeline/`, `dedup/`, `repos/`, `schema/`, `auth/`, `lib/`
- `src/lib/` — shared client+server utilities (db, env, logger, locale, format)
- `src/i18n/` — `en` + `zh-TW` string catalogs
- `prisma/` — schema, migrations, seed
- `scripts/` — `ingest.ts` (+ `ingest/`), `factory-db.ts`, prompt harness (`prompt-eval/`), `validate-{candidates,evaluations}.ts`, `capture-source-fixtures.ts`
- `tests/` — Vitest (`unit/`, `integration/`, `fixtures/`) + Playwright (`e2e/`)
- `paper_factory/` — the human-in-the-loop desktop GUI (Python)
- `.claude/skills/` — the collection/evaluation skills
- `data/` — `runs/` (skill output), `factory/` (Paper Factory working dirs), `sample/` (the data contract)
- `docs/` — PRD, current state, architecture, agent guide, roadmap, decision log

## Google login

PaperScout uses Google as the only login provider and Railway Postgres as the application database. Configure these in `.env.local`:

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

Sessions are stored server-side in Postgres; the browser receives only an HTTP-only session cookie holding an opaque token (only its SHA-256 hash is stored).

## Tech stack

| Concern    | Choice |
| ---------- | ------ |
| Framework  | Next.js 16 (App Router) + React 19 + TypeScript |
| UI         | shadcn/ui + Tailwind v4 |
| Database   | Railway PostgreSQL via Prisma v6 |
| Auth       | Google-only OAuth, server-side sessions |
| LLM        | Claude Code skills (invoked manually, outside the app) |
| Desktop    | Paper Factory — PySide6 + PyMuPDF |
| Testing    | Vitest (unit/integration) + Playwright (e2e) |

## Known limitations

- On-demand only — no scheduled runs.
- The web app is read-only over runs; new papers arrive via the skill / Paper Factory pipeline, not a UI button.
- `scripts/ingest.ts` is the sole DB writer; re-ingesting a run dir requires `--force`.
- Star-rating feedback is stored but does not influence ranking.
- The Paper Factory **Live DB** tab edits production Postgres with only a confirm dialog — there is no separate staging DB.

See [`docs/PRD_v1.md`](./docs/PRD_v1.md) §4 (Non-Goals) for what is intentionally deferred.

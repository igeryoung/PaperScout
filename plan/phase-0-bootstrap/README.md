# Phase 0 — Bootstrap

**Goal:** A runnable Next.js app with Postgres, Prisma, Tailwind, shadcn, env validation, logger, vitest+playwright configs, ESLint/Prettier, README. After this phase, `docker compose up -d && npm run dev` opens a default Next.js page at `localhost:3000`, and `npm test` is green.

## Why first

Everything downstream needs a buildable repo. We deliberately stop at "default page renders + DB reachable" — no business code yet — so Phase 0.5 PoC can run inside the same toolchain.

## Pre-flight blocker (resolved differently than originally planned)

`create-next-app .` errors when target dir contains `doc/`, `.omc/`, or `plan/`. Original plan was move-aside; **actual approach used:** scaffold into `/tmp/pcs-scaffold-tmp` and `cp -a` into project (no project files touched).

- [x] Scaffold into a temporary dir
- [x] Copy files into project (`cp -a /tmp/pcs-scaffold-tmp/. .`)
- [x] Confirm `doc/`, `.omc/`, `plan/` are intact post-merge

## Goal checklist

### Scaffold

- [x] Subdir scaffold via `npx --yes create-next-app@latest /tmp/pcs-scaffold-tmp --typescript --tailwind --app --src-dir --eslint --import-alias "@/*" --use-npm --turbopack --no-git --yes`
- [x] Merge: `cp -a /tmp/pcs-scaffold-tmp/. .` then `rm -rf /tmp/pcs-scaffold-tmp`
- [ ] `npm run dev` boots; `localhost:3000` shows the Next.js default page (build verified ✅; browser check pending)
- [x] Confirm `tsconfig.json`, `next.config.ts`, `postcss.config.mjs` exist (note: Tailwind v4 = no `tailwind.config.ts`; CSS-driven; `next.config.ts` not `.mjs` in Next 16)

### shadcn/ui setup

- [x] `components.json` written directly (interactive `init --yes` still asked Radix vs Base; bypassed)
- [x] Add baseline primitives: `button card dialog input select slider badge progress label textarea separator` (11 files in `src/components/ui/`)
- [x] Helper deps installed (shadcn doesn't auto-install): `clsx`, `tailwind-merge`, `lucide-react`, `class-variance-authority`
- [x] Spot-check: `npx tsc --noEmit` clean; `npm run build` green confirms primitives compile

### Postgres via Docker

- [x] Write `docker-compose.yml` with one service: `postgres:16-alpine`, port `5432`, healthcheck, named volume `pgdata`
- [ ] `docker compose up -d` → `docker compose ps` shows healthy (BLOCKED: Docker Desktop not running)
- [ ] `psql postgres://paperscout:paperscout@localhost:5432/paperscout -c '\l'` connects (BLOCKED: depends on above)

### Prisma init

- [x] `npm i -D prisma` and `npm i @prisma/client` (pinned to **v6**; v7 dropped datasource `url` → too disruptive for V1)
- [x] Edit `prisma/schema.prisma` to confirm `provider = "postgresql"` and `url = env("DATABASE_URL")`
- [x] Schema models stay empty in Phase 0 — added in Phase 0.5/Phase 1
- [x] `npx prisma generate` succeeds

### Env + lib

- [x] Add `zod` (`npm i zod`)
- [x] Create `src/lib/env.ts` — zod-validated `DATABASE_URL`, `ANTHROPIC_API_KEY`, optional `LOG_LEVEL`. Throws on parse failure.
- [x] Create `src/lib/db.ts` — Prisma singleton with `globalThis.__prisma` cache for dev hot reload
- [x] Create `src/lib/logger.ts` — `pino` honoring `env.LOG_LEVEL`. Exports `logger`.
- [x] Create `src/lib/utils.ts` — `cn()` from `clsx` + `tailwind-merge`

### Test runner setup

- [x] `npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom`
- [x] `vitest.config.ts` — node env, alias `@` → `./src`
- [x] `tests/unit/sample.test.ts` — passing
- [x] `npm i -D @playwright/test`
- [ ] `npx playwright install chromium` (deferred to Phase 5 when E2E test is written)
- [x] `playwright.config.ts` — base URL `http://localhost:3000`, headless, single chromium project
- [x] `tests/e2e/.gitkeep`
- [x] Add npm scripts: `test`, `test:watch`, `test:e2e`

### Lint + format

- [x] Confirm ESLint config from create-next-app works
- [x] `npm i -D prettier prettier-plugin-tailwindcss eslint-config-prettier`
- [x] `.prettierrc.json` (semi, single quotes, trailing commas, 2-space indent, tailwind plugin)
- [x] Run `npx prettier --write .` once to normalize
- [x] Add `format` script
- [x] `eslint.config.mjs` extended with `eslint-config-prettier`; `src/components/ui/**` ignored

### Env files + README

- [x] `.env.example` — `DATABASE_URL`, `ANTHROPIC_API_KEY`, `LOG_LEVEL=info`
- [ ] `.env.local` populated locally with real `ANTHROPIC_API_KEY` (user-side)
- [x] `.gitignore` updated to allow `.env.example` while ignoring local secrets, agent state, build output, test reports, and skill run artifacts
- [x] `README.md` quickstart written

### Git

- [x] `git init` — repo initialized on `main`
- [x] First commit: `chore: bootstrap paper collection system` (`400fab3`)

## Files created in this phase

```
docker-compose.yml
.env.example
.prettierrc.json
README.md
next.config.ts                    (from create-next-app; Next 16 ships .ts)
postcss.config.mjs                (from create-next-app; Tailwind v4)
tsconfig.json                     (from create-next-app)
package.json                      (renamed to paper-collection-system; scripts added)
vitest.config.ts
playwright.config.ts
eslint.config.mjs                 (from scaffold; extended with prettier)
components.json                   (shadcn config)
prisma/schema.prisma              (empty models — Phase 0)
src/app/layout.tsx                (from scaffold)
src/app/page.tsx                  (default; will replace in Phase 4)
src/app/globals.css               (Tailwind v4 + shadcn variables)
src/components/ui/{button,card,dialog,input,select,slider,badge,progress,label,textarea,separator}.tsx
src/lib/env.ts
src/lib/db.ts
src/lib/logger.ts
src/lib/utils.ts                  (cn helper)
tests/unit/sample.test.ts
tests/e2e/.gitkeep
```

## Verification checklist (must all pass to close phase)

- [ ] `docker compose up -d` exits 0; `docker compose ps` shows postgres healthy (BLOCKED: Docker not running)
- [ ] `psql $DATABASE_URL -c 'SELECT 1'` returns `1` (BLOCKED: same)
- [ ] `npm run dev` opens `localhost:3000` with the default page in <5s (browser confirmation pending)
- [x] `npm run build` exits 0
- [x] `npm test` exits 0
- [x] `npx prisma generate` exits 0
- [x] `git status` clean after initial commit; `doc/` committed and `.omc/` preserved locally but ignored
- [ ] `src/lib/env.ts` throws a readable error when `DATABASE_URL` is missing (manual check pending)
- [ ] `plan/STATE.md` updated to point to the next phase (Phase 0.5)
- [x] New entry appended at top of today's `plan/log/2026-05-07.md`

## Exit criteria

All checkboxes above are ticked. Phase 0 is **~85% complete**; remaining items are user-side/runtime checks (start Docker, browser check, populate `.env.local`, verify missing-env error).

## Risks / pitfalls

- **`create-next-app` overlay**: subdir-scaffold + `cp -a` was the working approach.
- **Prisma v7 vs v6**: v7 dropped `url` from datasource. Pinned v6. Revisit when v7 ecosystem matures.
- **Tailwind v4**: no `tailwind.config.ts`; config lives in CSS via `@import "tailwindcss"` and `@theme`.
- **Pino on Edge runtime**: keep server-side imports inside `src/server/` only; don't import logger in client components.
- **Playwright on Apple Silicon**: `npx playwright install chromium` will be needed before Phase 5 E2E.

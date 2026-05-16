# Phase 5 — Feedback & Library

**Goal:** User can rate papers 1–5 stars + leave optional comments. Library page shows all stored papers with the PRD §18 filters: date / source / tag / recommended / score / rating. One Playwright happy-path E2E test guards regression.

## Why last

The data and ranked UI exist; this layer adds user input and browsing. Closing this phase = V1 done per PRD §26.

## Goal checklist

### Star rating (`src/components/star-rating.tsx`)

- [ ] 5 clickable star icons (filled / outline)
- [ ] Hover preview (highlight up to hovered star)
- [ ] Click → set rating
- [ ] Debounced auto-save (~500ms after last click) to `POST /api/papers/<id>/feedback`
- [ ] Optimistic update; revert on error
- [ ] Reads initial rating from server-loaded paper data
- [ ] Disabled state during save; toast on save success/failure

### Comment box (`src/components/comment-box.tsx`)

- [ ] Textarea with character counter (max 2000)
- [ ] Save / Cancel buttons; only enabled when text differs from saved value
- [ ] On Save: PUT `/api/papers/<id>/feedback` with `{ rating, comment }`
- [ ] On Cancel: revert to last-saved value
- [ ] Auto-resize height up to a cap

### Feedback API (`src/app/api/papers/[id]/feedback/route.ts`)

- [ ] POST or PUT — request body: `{ runId?: string, rating: number, comment?: string }`
- [ ] Validates `1 <= rating <= 5`; comment ≤ 2000 chars
- [ ] Upserts `paper_feedback` keyed by `(paperId, runId, userId=null)`:
  - If exists: update rating/comment, bump `updatedAt`
  - Else: create
- [ ] Returns 200 with the persisted row
- [ ] DELETE (optional) — clears rating/comment

### Wire into existing components

- [ ] `<PaperCard />` — replace placeholder `<StarRating />` with real, save-on-click
- [ ] `<PaperDetail />` — replace placeholders with real `<StarRating />` + `<CommentBox />`
- [ ] Both read existing feedback from page-level data fetch

### Library page (`src/app/library/page.tsx`)

Upgrade from the Phase 1 skeleton:

- [ ] Server Component with searchParams driving filters
- [ ] Filter sidebar (`<LibraryFilters />` Client Component) updates URL params
- [ ] Main content: paginated card list (20 per page) with cursor pagination

### `<LibraryFilters />` (`src/components/library-filters.tsx`)

- [ ] Date collected — date range picker (shadcn calendar)
- [ ] Source — multi-select checkbox: arXiv / OpenReview / HuggingFace
- [ ] Recommended status — toggle: All / Recommended only / Stored only
- [ ] Tags — multi-select; options pulled from `/api/papers/tags` (distinct values)
- [ ] Score range — dual slider 0–100
- [ ] Rating — multi-select: 1, 2, 3, 4, 5 (or "unrated")
- [ ] Keyword — text input, searches title + abstract (Postgres `ILIKE %term%` for V1)
- [ ] "Clear all" button resets all params
- [ ] Filter changes update URL via `router.replace` (no scroll jump); Server Component re-fetches

### Library API (`src/app/api/papers/route.ts`)

- [ ] GET with query params:
  - `dateFrom`, `dateTo` (ISO date)
  - `sources` (CSV)
  - `recommended` ('all' | 'true' | 'false')
  - `tags` (CSV)
  - `scoreMin`, `scoreMax`
  - `ratings` (CSV ints, plus 'unrated')
  - `q` (keyword)
  - `cursor`, `limit` (default 20, max 100)
- [ ] Joins `papers` ← `paper_run_results` ← `paper_evaluations` (latest per paper) ← `paper_feedback` ← `paper_tags`
- [ ] Returns `{ items: [...], nextCursor: ... }`

### Tags discovery API (`src/app/api/papers/tags/route.ts`)

- [ ] GET → distinct `paper_tags.tag` values, count desc, limit 100
- [ ] Cached for 60s (revalidate header)

### Playwright happy-path (`tests/e2e/happy-path.spec.ts`)

- [ ] Test name: `generates recommendations and persists user rating`
- [ ] Pre: `await db.paper.deleteMany({})`; mock Anthropic via env-flag stub or run against fixture data via a `?mock=1` flag in `/api/runs`
- [ ] Steps:
  1. `goto('/')`
  2. Click `Generate Today's Recommendations`
  3. Wait for URL to match `/runs/...`
  4. Wait for "Completed" stage to appear (timeout 60s)
  5. Expect 10 `[data-testid="paper-card"]` elements
  6. Click first card title
  7. Expect URL to match `/papers/...`
  8. Click 4-star rating
  9. Type comment "looks good", click Save
  10. Reload page; assert rating shows 4, comment shows "looks good"
  11. `goto('/library')`
  12. Set Recommended filter to "Recommended only"
  13. Expect ≥10 visible cards

## Files created in this phase

```
src/app/library/page.tsx                            (upgrade)
src/app/api/papers/route.ts                          (upgrade)
src/app/api/papers/[id]/route.ts
src/app/api/papers/[id]/feedback/route.ts
src/app/api/papers/tags/route.ts
src/components/library-filters.tsx
(src/components/star-rating.tsx upgraded, was placeholder)
(src/components/comment-box.tsx upgraded, was placeholder)
tests/e2e/happy-path.spec.ts
```

## Verification checklist

- [ ] Click 4 stars on any card → reload → rating persists
- [ ] Add comment "test" → save → reload → comment shows
- [ ] Edit comment → save → `paper_feedback.updated_at` advances
- [ ] `/library` lists all stored papers with filters working independently
- [ ] Combining filters (e.g. recommended=true + scoreMin=80) reduces results correctly
- [ ] Keyword search hits both title and abstract
- [ ] `npx playwright test` green on `happy-path.spec.ts`
- [ ] No console errors during the click-through
- [ ] PRD §5 main workflow steps 1–15 all reachable in the running app
- [ ] [`doc/STATE.md`](../STATE.md) updated to mark V1 complete
- [ ] Final entry appended at top of today's `doc/log/YYYY-MM-DD.md` summarizing the V1 release

## Exit criteria

V1 acceptance from PRD §26 met:

> A researcher can click one button, receive a ranked list of the top 10 recent CV papers, inspect why each paper was recommended, rate papers, and trust that all collected papers are stored in a reusable database that avoids duplicate future processing.

## Risks / pitfalls

- **Filter combinatorics** — many filter combinations + cursor pagination = tricky SQL. Use Prisma's `where` + `cursor`; keep filters AND-ed.
- **Tag explosion** — if free-form LLM tags create thousands of unique values, the tag multi-select becomes unusable. Cap at top 100 by frequency; allow free text-search later.
- **Concurrent rating saves** — debounce + cancel-prior-request pattern; otherwise a fast click sequence can save out-of-order.
- **Playwright flakes on LLM-backed run** — using a `?mock=1` flag that swaps Anthropic for a deterministic stub keeps the E2E test fast and reliable. Document the flag in README.
- **Filter param URL bloat** — when many tags selected, URL grows. Acceptable for V1; consider POST-based filter state later.
- **Privacy** — even single-user, the comment text is sensitive. Don't log full comments at INFO level; log `paperId` and `len`.

---

## V1 release readiness checklist (final gate)

- [ ] All Phase 0–5 boxes ticked
- [ ] [`doc/STATE.md`](../STATE.md) reflects V1 complete
- [ ] PRD §22 success metrics: at least the _Collection Metrics_ are observable in DB queries (counts per run, dedup rate, PDF success rate)
- [ ] Cost per real run < $2 (matches Phase 0.5 R4 bar)
- [ ] README has a "Quick start" + "How it works" + "Known limitations" section
- [ ] Single tagged commit `v1.0.0` on main

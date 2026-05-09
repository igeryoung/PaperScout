# Phase 4 — Recommendation UI

**Goal:** Click-through end-to-end: user clicks **Generate Today's Recommendations** → sees progress through 5 stages → top-10 ranked list renders → expands a paper to see full detail (PRD §8).

## Why fifth

Phase 3 produces ranked data in the DB. Phase 4 puts a face on it.

## Goal checklist

### Main page (`src/app/page.tsx`)

- [ ] Server Component that:
  - [ ] Checks for the most recent `DailyRun` with `runDate = today`
  - [ ] If a completed run exists: render its top-10 list directly
  - [ ] If a running run exists: redirect to `/runs/<id>`
  - [ ] Else: render `<GenerateButton />`
- [ ] On `<GenerateButton />` click:
  - [ ] POST `/api/runs`
  - [ ] On 200: router.push(`/runs/<id>`)
- [ ] Loading state on the button (disabled + spinner)
- [ ] Error toast on POST failure

### Run detail page (`src/app/runs/[id]/page.tsx`)

- [ ] Server Component fetches initial run state (status, progress)
- [ ] If `status !== 'completed'`: render `<RunProgress runId={id} />` Client Component
- [ ] If `status === 'completed'`: render top-10 cards
- [ ] `?showAll=1` query param toggles to all-30 view (PRD §18 "Access to today's full 30-paper collection")
- [ ] Page title: "Recommendations for {runDate}"

### `<RunProgress />` (`src/components/run-progress.tsx`)

- [ ] Client Component
- [ ] Polls `/api/runs/<id>` every 2 seconds
- [ ] Renders 5 named stages with check / spinner / pending icons:
  1. Collecting papers
  2. Deduplicating
  3. Screening abstracts (with `screened/total` counter)
  4. Analyzing PDFs (with `pdfs_analyzed/total` counter)
  5. Ranking
- [ ] On `status='completed'`: stop polling, navigate to same page (re-renders with results) or trigger a re-fetch
- [ ] On `status='failed'`: stop polling, show error message + retry button
- [ ] Cleanup on unmount

### `<PaperCard />` (`src/components/paper-card.tsx`)

Renders one item in the ranked top-10 list, per PRD §18 ranked-list-item:

- [ ] Rank number (large, left)
- [ ] Title (link to `/papers/<id>` for deep link)
- [ ] Authors (truncate to first 3 + "…et al.")
- [ ] Venue / source pill
- [ ] Score: `87 / 100` with progress bar
- [ ] Tags (badges, max 5 visible)
- [ ] Short summary (3-line clamp)
- [ ] Recommendation reason (italic, 2-line clamp)
- [ ] Action row: `[PDF]` `[arXiv]` `[OpenReview]` `[Code]` (each button only renders if URL exists)
- [ ] `<StarRating />` row (Phase 5 wires the save; in Phase 4, render placeholder ☆☆☆☆☆)

### `<PaperDetail />` (`src/components/paper-detail.tsx`)

Expanded view (PRD §8):

- [ ] All `<PaperCard />` fields
- [ ] Abstract (full)
- [ ] Key contribution
- [ ] Methodology summary
- [ ] Strengths bullet list
- [ ] Weaknesses bullet list
- [ ] `<ScoreBreakdown />` — 5 dimension bars with values
- [ ] Ranking explanation (full text)
- [ ] All links (PDF, arXiv, OpenReview, HF, Code)
- [ ] `<StarRating />` + comment box (placeholders — wired in Phase 5)

### `<ScoreBreakdown />` (`src/components/score-breakdown.tsx`)

- [ ] 5 horizontal bars labeled with dimension name + score / max
  - Novelty (25)
  - Methodological rigor (25)
  - Experimental quality (20)
  - Venue / source credibility (15)
  - Author / institution reputation (15)
- [ ] Visual color: green if ≥75% of max, yellow if 40-75%, red if <40%
- [ ] Total displayed prominently above bars

### Paper detail page (`src/app/papers/[id]/page.tsx`)

- [ ] Server Component
- [ ] Loads Paper + latest PaperEvaluation (full_pdf preferred, else abstract_screening) + tags + sources + code links + latest feedback
- [ ] Renders `<PaperDetail />` with all data
- [ ] 404 on missing paper id

### Loading + error states

- [ ] `src/app/loading.tsx` — top-level skeleton
- [ ] `src/app/runs/[id]/loading.tsx` — skeleton for the 10 cards
- [ ] `src/app/papers/[id]/loading.tsx` — skeleton for detail
- [ ] `src/app/error.tsx` — generic error boundary
- [ ] API fetch errors surfaced as toasts (use `sonner` or a custom Toast)

### Polish

- [ ] Header layout with title and link to `/library`
- [ ] Tailwind responsive: cards stack on mobile, side-by-side max-width on desktop
- [ ] Dark mode (shadcn supports out of the box; verify it doesn't break)
- [ ] Keyboard accessible: Tab through cards, Enter expands

## Files created in this phase

```
src/app/page.tsx                                    (replace default)
src/app/loading.tsx
src/app/error.tsx
src/app/runs/[id]/page.tsx
src/app/runs/[id]/loading.tsx
src/app/papers/[id]/page.tsx
src/app/papers/[id]/loading.tsx
src/components/generate-button.tsx
src/components/run-progress.tsx
src/components/paper-card.tsx
src/components/paper-detail.tsx
src/components/score-breakdown.tsx
src/components/star-rating.tsx                       (placeholder; wired in Phase 5)
src/components/comment-box.tsx                       (placeholder; wired in Phase 5)
```

## Verification checklist

- [ ] `npm run build` exits 0
- [ ] Click Generate from `/` → page navigates to `/runs/<id>` → 5-stage progress visible → top-10 renders on completion
- [ ] Each card shows all PRD §18 fields populated (or N/A placeholders for missing data)
- [ ] Click a card title → `/papers/<id>` shows full detail
- [ ] Score breakdown bars display correctly for the 5 dimensions
- [ ] Loading skeletons render before data
- [ ] Error in API surfaces as a toast, not a crash
- [ ] Dark mode toggle works (browser preference respected)
- [ ] `plan/STATE.md` updated to point to Phase 5
- [ ] New entry appended at top of today's `plan/log/YYYY-MM-DD.md`

## Exit criteria

Manual click-through covers PRD §5 main workflow steps 1–13 (rating in Phase 5).

## Risks / pitfalls

- **Polling frequency** — 2s is fine for 30 papers; if a stage stalls (e.g. Anthropic 5xx retries), UI may look frozen. Show stage-level "elapsed" time.
- **Server Component cache** — `/runs/<id>` page must opt out of caching for status updates: `export const dynamic = 'force-dynamic'`.
- **Hydration mismatch** — `<RunProgress />` is Client; ensure no shared state with server-rendered initial paint (use `useEffect` only).
- **Long author lists** — truncate consistently to avoid card height jitter.
- **Large abstracts** — clamp on cards but unclamp in detail view.
- **Missing data** — paper without PDF / OpenReview link must not break the card; conditionally render link buttons only when URLs exist.

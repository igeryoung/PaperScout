# Phase 6 — User Workspace Infrastructure

**Goal:** Add the account and workspace foundation for PaperScout CV without giving normal users control over paper collection runs.

This phase turns the app from a local single-user viewer into a logged-in research workspace where users can keep, organize, annotate, and review papers collected by the system.

## Priority

1. User / account foundation
2. User-owned saved papers, collections, preferences, notes, and feedback
3. User dashboard for collected/grouped papers and personal activity
4. Remaining web pages needed by the workspace
5. UX improvements on the workspace flows
6. Agent resource review app — deferred for later planning

## Product decisions

- Normal users **cannot start paper collection runs** in this phase.
- Collection runs remain system/manual/admin-owned infrastructure.
- Users can own:
  - feedback
  - saved papers
  - collections
  - preferences
  - reading status
  - private notes
  - account settings
  - dashboard/activity state
- User interest profile and personalized ranking are out of scope.
- Agent resource review tooling is out of scope for this phase.

## User features included

### 1. Basic auth

- Sign up
- Sign in
- Sign out
- Session persistence
- Protected workspace routes
- Redirect unauthenticated users away from workspace-only pages

### 2. User-owned data

- Feedback belongs to a user.
- Saved papers belong to a user.
- Collections belong to a user.
- Preferences belong to a user.
- Private notes belong to a user.
- Existing global papers remain shared source records, not duplicated per user.

### 3. Saved papers

- User can save or unsave any paper.
- Saved state is visible on paper cards and paper detail pages.
- Saved papers appear in the user's workspace/dashboard.
- A paper can be saved without being rated.

### 4. Reading status

Supported statuses:

- `saved`
- `reading`
- `read`
- `skipped`

Rules:

- Status is per user and per paper.
- Default status after save is `saved`.
- Unsaved papers do not need a reading status.

### 5. Collections

- User can create named collections.
- User can add saved papers to one or more collections.
- User can remove papers from collections without unsaving the paper.
- Collections are personal, not shared.

### 6. User notes

- User can write private notes on a saved paper.
- Notes are separate from feedback comments.
- Feedback comments are about recommendation quality; notes are for the user's research workflow.

### 7. Account settings

- Preferred locale
- Display name
- Email/account identity
- Default workspace view

### 8. User dashboard and analysis

Dashboard should answer:

- What papers has this user saved?
- What papers is this user currently reading?
- What collections has this user created?
- What topics/tags appear most in this user's saved papers?
- How many papers has the user saved/read/skipped?
- What recent system runs produced papers the user saved?

Because users cannot run collection jobs, this is **not** a per-user run-control dashboard. It is a personal research workspace dashboard over system-collected papers.

## Out of scope

- User-created collection runs
- User-defined research domains outside computer vision
- Interest profile / recommendation preference tuning
- Personalized ranking
- Teams, organizations, sharing, invitations
- Admin panel
- Billing
- Agent resource review workflow

## Suggested implementation slices

### Slice 1 — Auth and route boundary

Outcome: the app has real users and protected workspace routes.

Checklist:

- [x] Pick auth provider/approach: Google-only OAuth.
- [x] Add user/account/session persistence.
- [x] Add sign-in entry point and sign-out/session APIs.
- [ ] Add route protection for user workspace pages.
- [ ] Keep public paper/runs browsing behavior explicit: either public read-only or authenticated-only.
- [x] Add auth-aware header state.

Key decision:

- Whether paper discovery pages remain public read-only or require login.

Recommendation:

- Require login for workspace pages; allow public read-only browsing only if it helps product demo.

### Slice 2 — User ownership model

Outcome: all user actions have a clear owner.

Checklist:

- [ ] Add user ownership to feedback.
- [ ] Add saved-paper model.
- [ ] Add reading-status model or field.
- [ ] Add collection model.
- [ ] Add collection membership model.
- [ ] Add user preferences model.
- [ ] Add private paper notes model.

Data boundary:

- `Paper`, `PaperSource`, `PaperEvaluation`, `PaperFigure`, `PaperTag`, and `DailyRun` remain global/system data.
- `PaperFeedback`, saved papers, collections, notes, and preferences become user-owned data.

### Slice 3 — Saved paper workflow

Outcome: a user can build their personal library.

Checklist:

- [ ] Save/unsave action on paper card.
- [ ] Save/unsave action on paper detail page.
- [ ] Reading-status control.
- [ ] Saved-paper list in workspace.
- [ ] Persist state across reloads.
- [ ] Tests for ownership isolation between users.

### Slice 4 — Collections workflow

Outcome: a user can group collected papers.

Checklist:

- [ ] Create/edit/delete personal collection.
- [ ] Add saved paper to collection.
- [ ] Remove paper from collection.
- [ ] Collection detail page.
- [ ] Collection list page.
- [ ] Empty states for new users.

### Slice 5 — Notes and feedback separation

Outcome: feedback and research notes no longer compete for the same field.

Checklist:

- [ ] Feedback rating/comment remains recommendation feedback.
- [ ] Notes become private research annotations.
- [ ] Paper detail page shows both where appropriate.
- [ ] Do not log full note/comment text.

### Slice 6 — Dashboard

Outcome: a user has a home base for their research workspace.

Checklist:

- [ ] Saved count
- [ ] Reading count
- [ ] Read count
- [ ] Skipped count
- [ ] Recent saved papers
- [ ] Collections summary
- [ ] Top tags from saved papers
- [ ] Recent system runs connected to saved papers

### Slice 7 — Settings and preferences

Outcome: user-level defaults exist before deeper UX work.

Checklist:

- [ ] Preferred locale
- [ ] Default dashboard/library view
- [ ] Account identity display
- [ ] Basic account management page

## Suggested route map

Public or auth-gated, pending Slice 1 decision:

- `/`
- `/runs/[id]`
- `/papers/[id]`
- `/library`

Auth-only:

- `/sign-in`
- `/sign-up`
- `/workspace`
- `/workspace/saved`
- `/workspace/collections`
- `/workspace/collections/[id]`
- `/workspace/settings`

## Suggested data model additions

Names are provisional and should be adapted to the auth provider.

- `User` — implemented for Google identity.
- `Session` — implemented as server-side session storage.
- `UserPreference`
- `SavedPaper`
- `PaperCollection`
- `PaperCollectionItem`
- `PaperNote`

Existing models to revisit:

- `PaperFeedback.userId` should become required once migration/backfill strategy is chosen.
- `DailyRun.userId` should stay nullable/system-owned while normal users cannot start runs.

## Verification checklist

- [ ] Unauthenticated user cannot access workspace pages.
- [ ] Authenticated user can save/unsave a paper.
- [ ] Saved papers are isolated per user.
- [ ] Authenticated user can create a collection.
- [ ] User can add/remove papers from a collection.
- [ ] Notes are isolated per user.
- [ ] Feedback is isolated per user.
- [ ] Dashboard counts match saved/status/collection data.
- [ ] Normal user cannot start a collection run.
- [ ] Existing paper/runs display still works after auth.

## Risks / pitfalls

- **Auth provider lock-in** — choose an approach that does not force a broad rewrite if deployment target changes.
- **Nullable ownership migration** — existing feedback has `user_id = null`; decide whether to backfill to a default local user or keep legacy rows read-only.
- **Collection vs saved-paper duplication** — collections should group saved papers, not replace the saved-paper concept.
- **Feedback vs notes confusion** — feedback trains future product/recommendation behavior; notes are private research memory.
- **Dashboard scope creep** — dashboard should summarize user workspace state, not implement personalized ranking.
- **Run ownership confusion** — users cannot run jobs, so do not model `DailyRun` as user-owned yet.

## Open questions

- Which auth approach should be used?
- Should paper browsing be public read-only or login-only?
- Should existing anonymous feedback be migrated to a default user?
- Should users be able to save papers from all historical runs or only visible/recommended papers?
- Should deleting a saved paper remove it from collections automatically?

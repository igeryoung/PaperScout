# Run a collection cycle

One cycle = collect candidates → evaluate them → ingest into Postgres → review on `/library`. All three steps are user-triggered; nothing runs on a schedule.

## Prerequisites (one-time)

- Postgres running locally on port 5435 (`docker compose up -d`)
- `.env.local` has `DATABASE_URL` pointing at it
- `npm run prisma:migrate` has been applied
- `npm run dev` running in another shell if you want to view `/library`

## Step 1 — Collect candidates

In Claude Code, invoke the `collect-papers` skill:

```
/collect-papers
```

What it does: gathers ~30 recent computer-vision papers across arXiv, OpenReview, and Hugging Face, deduplicates them, and writes:

```
data/runs/<YYYY-MM-DD-HHMM>/candidates.json
```

The file conforms to `CandidateRecord` in `src/server/schema/candidate.ts`. Reference shape: `data/sample/candidates.json`.

Optional sanity check before proceeding:

```bash
npm run validate:candidates data/runs/<dir>/candidates.json
```

## Step 2 — Evaluate candidates

In the same Claude Code session (or a new one — the skill finds the latest run dir), invoke:

```
/evaluate-papers
```

What it does:
- **Stage 1** — screens every abstract in `candidates.json`
- **Stage 2** — downloads + reads PDFs for the top 15
- Writes `data/runs/<YYYY-MM-DD-HHMM>/evaluations.json` next to the candidates file, conforming to `EvaluationRecord`. Reference shape: `data/sample/evaluations.json`.

Optional sanity check:

```bash
npm run validate:evaluations data/runs/<dir>/evaluations.json
```

## Step 3 — Ingest into Postgres

```bash
npm run ingest data/runs/<YYYY-MM-DD-HHMM>
```

What `scripts/ingest.ts` does:
1. Validates both JSON files (Zod) and cross-checks every evaluation `joinKey` resolves to a candidate.
2. Refuses to re-ingest a run dir already in `daily_runs.ingest_source_dir` — pass `--force` to delete the prior run (cascades) and re-ingest.
3. Hashes `.claude/skills/evaluate-papers/SKILL.md` → stores as `llm_prompt_version` on every evaluation row (audit trail across prompt edits).
4. Creates a `DailyRun` row with `status = RUNNING`.
5. For each candidate, runs the PRD §17 dedup cascade (arxivId → openreviewId → sourceUrl → normalizedTitle → pdfUrl → fuzzy). NEW papers get `Paper` + `PaperSource` rows; matches reuse the existing `paperId` and only add missing sources. Fuzzy / normalized-title hits also write a `PaperDuplicate` edge.
6. Persists evaluations (recomputes `totalScore` server-side from the 5 sub-scores) and `LLM_GENERATED` tags.
7. Sorts by total score (FULL_PDF stage beats ABSTRACT_SCREENING for the same paper), writes `final_rank` to every `PaperRunResult`, marks the top 10 `is_recommended = true`.
8. Flips `status → COMPLETED`.

Expected output:

```
Ingested 30 papers (24 new, 6 existing); 10 recommended; run id <uuid>
```

## Step 4 — Review

Open <http://localhost:3050/library> — the seeded + ingested papers list with title / authors / source badge / dates, sorted desc by `createdAt`.

For raw inspection:

```bash
npm run prisma:studio
```

## Re-running a cycle

- **Same run dir, fix data and retry** — `npm run ingest data/runs/<dir> --force` (deletes the prior `DailyRun` and all its children, then re-ingests).
- **Fresh cycle** — re-run `/collect-papers`; it produces a new timestamped dir, so the previous run's DB rows are untouched.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `candidates.json schema invalid: ...` | Skill output drifted from `CandidateRecord`. Compare against `data/sample/candidates.json`. |
| `evaluation joinKey X:Y does not match any candidate` | Evaluation's `joinKey.source` + `sourcePaperId` doesn't appear in candidates (or its `additionalSources`). |
| `Run dir already ingested as run <id>` | Use `--force` or pick a different run dir. |
| `/library` empty after ingest | Check `npm run ingest` exit code; confirm rows exist via `npm run prisma:studio`. |

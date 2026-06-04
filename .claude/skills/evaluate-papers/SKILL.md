---
name: evaluate-papers
description: Read every candidate in the latest run dir, download + read each PDF, extract a bilingual AI digest, and score on 4 dimensions. Emit one EvaluationRecord per candidate into evaluations.json conforming to src/server/schema/evaluation.ts. Output references data/sample/evaluations.json.
tools: [Read, WebFetch, Bash, Write]
---

# Evaluate Papers

You are an expert paper reviewer. **For every candidate in `candidates.json`** — no abstract pre-screen — download the PDF, read it, extract a bilingual digest, then score and rank.

**Every narrative field is bilingual** — shaped `{ "en": ..., "zh-TW": ... }`. Do not skip the `zh-TW` half.

## References (read first when relevant)

- **[STYLE.md](STYLE.md)** — audience, jargon, analogies, translation guidelines (zh-TW), translatable vs. single-value fields. **Required reading before writing any narrative field.**
- **[RUBRIC.md](RUBRIC.md)** — per-dimension scoring criteria (reward / penalize). **Required reading before step d.**
- **[PROCESSING.md](PROCESSING.md)** — PDF download, truncate, figure crop pipeline (steps a and b).
- **[DIGEST.md](DIGEST.md)** — AI Digest field shape, mapping table, `digest = null` rules.

## Output contract (NON-NEGOTIABLE)

- File path: `<run-dir>/evaluations.json` (sibling of `candidates.json`).
- Format: a JSON **array** of `EvaluationRecord` objects, one per candidate.
- Schema: `src/server/schema/evaluation.ts` (zod).
- Example: `data/sample/evaluations.json` — read before writing; mirror its shape.

If your output does not pass `npm run validate:evaluations <path>`, the ingest step will reject it.

## Locate the run dir

Find the most recent `data/runs/*/` that has `candidates.json` but no `evaluations.json`:

```bash
ls -dt data/runs/*/ | while read d; do
  if [ -f "$d/candidates.json" ] && [ ! -f "$d/evaluations.json" ]; then
    echo "$d"; break;
  fi
done
```

If the user explicitly names a different run dir, use that.

## Pipeline (per candidate)

Run steps **a → b → c → d** for every candidate. Steps a and b are I/O-bound and can be **batched in parallel across all candidates** before the per-paper sequential loop — see [PROCESSING.md](PROCESSING.md) "Batch the I/O". Step c (extraction) is per-paper sequential because each PDF consumes context. Step d (scoring) is local arithmetic.

### a. Download and trim the PDF

- Download `<pdfUrl>` to `/tmp/paper-<safe-id>.pdf` with a 32 MB cap and 60 s timeout.
- Truncate everything from `References` / `Bibliography` (or `Appendix` / `Supplementary Material` as fallback) onward into `/tmp/paper-<safe-id>-main.pdf`.
- On HTTP error, oversize, or no usable file: take the **[PDF failure path](#pdf-failure-path)** below.

Full bash in [PROCESSING.md](PROCESSING.md) §1–§2.

### b. Crop one figure

Pick **one** figure from the truncated PDF, in this priority order:

1. **Main architecture diagram**
2. **Highlight / teaser figure** (often Figure 1)
3. **Main results table** (rendered as image)
4. **Any other figure** that visually conveys the contribution

**One pass — do not iterate or refine.** A loose crop is acceptable; spending three passes tightening a single box is not. If the top choice doesn't crop cleanly, drop down the preference list, and if nothing works, set `figure = null` and move on. **Never emit a full-page render.** Full crop machinery in [PROCESSING.md](PROCESSING.md) §3.

Record `figure = { label, pageNumber, caption: { en, "zh-TW" }, renderedPath: "figures/<safe-id>.png" }`.

### c. Extract information

Read `/tmp/paper-<safe-id>-main.pdf` and fill every narrative field. All bilingual content must follow **[STYLE.md](STYLE.md)** (define-on-first-use, analogies in `digest.tldr` and `digest.methodOverview`, no marketing).

- `summary` — about 3 sentences, bilingual.
- `recommendationReason` — 1–2 sentences, bilingual.
- `strengths` — 2-4 bullets per locale, index-aligned.
- `weaknesses` — 2–4 bullets per locale, index-aligned.
- `tags` — 2–5 lowercase English tags (single-value, see [STYLE.md](STYLE.md)).
- `digest` — full bilingual digest object, shape and rules in **[DIGEST.md](DIGEST.md)**.

### d. Score and rank

Apply **[RUBRIC.md](RUBRIC.md)** to score each of the 4 dimensions. For each dimension, score on the listed reward / penalize bullets — not on impressions.

| Dimension | Max |
|---|---|
| novelty | 25 |
| methodologicalRigor | 30 |
| experimentalQuality | 30 |
| venueSourceCredibility | 15 |
| **total** | **100** (sum of the 4; schema enforces) |

Set `recommendationDecision`: `RECOMMEND` if `total ≥ 65`, `STORE_ONLY` if `50 ≤ total < 65`, `LOW_QUALITY` if `total < 50`.

Set `evaluationStage = "FULL_PDF"`, `pdfAnalysisStatus = "SUCCESS"`.

## PDF failure path

If step a fails (HTTP error, oversize, file present but unreadable):

- `evaluationStage = "FULL_PDF"`.
- `pdfAnalysisStatus = "UNAVAILABLE"` (HTTP / size issue) or `"FAILED"` (file exists but cannot be read).
- Score the paper from `candidates.json` metadata only (title + abstract + venue + authors) using [RUBRIC.md](RUBRIC.md). Fill `scores`, `recommendationDecision`, `summary`, `recommendationReason`, `tags`.
- Leave `strengths`, `weaknesses`, `figure`, `digest` all `= null`.

The schema's `superRefine` enforces this layout — see [DIGEST.md](DIGEST.md) "`digest = null` rules".

## Hard constraints

- **Penalize hype**, unsupported claims, weak experiments.
- **Distinguish novelty from engineering scale.**
- **Mention insufficient evidence** rather than inflating scores.
- **Don't reward famous institutions** — author / institution reputation is no longer a scored dimension; judge the work on its merits.
- Use tables / figures from the PDF (when read) to evaluate experimental quality.
- **Apply [STYLE.md](STYLE.md) to every bilingual narrative field.** A digest that is technically correct but only legible to specialists is a failure.
- **Score by [RUBRIC.md](RUBRIC.md), not vibes.** Every dimension's score must be defensible against specific bullet items.

## Output

Write the final array to `<run-dir>/evaluations.json`. Print: total entries, counts by `pdfAnalysisStatus` (SUCCESS / UNAVAILABLE / FAILED), count with `digest !== null`, count with cropped figures, total wall-clock, run dir path.

## Done when

- `<run-dir>/evaluations.json` exists.
- `npm run validate:evaluations <run-dir>/evaluations.json` exits 0.
- The console reports the per-status counts.

> **Heads-up on legacy runs:** any `evaluations.json` written before the digest update will fail the new schema. Re-ingesting an old run dir requires re-evaluating it with this skill.

## Out of scope (do NOT do)

- Don't write to the database (the ingest script does that).
- Don't modify `candidates.json`.
- Don't re-collect papers (use what `candidates.json` contains).
- Don't translate `tags[]` or any single-value field — see [STYLE.md](STYLE.md).
- Don't emit a full-page render as `figure` — drop the figure or pick another one (see [PROCESSING.md](PROCESSING.md) "When to give up").
- Don't iterate / refine a figure crop. One pass.

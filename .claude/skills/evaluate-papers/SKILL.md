---
name: evaluate-papers
description: Score and write a bilingual digest for papers in a Paper Factory export bundle. The human has ALREADY downloaded, truncated, and cropped each PDF in the GUI — so this skill only does extraction + scoring (no download/truncate/crop). Emits evaluations.json conforming to src/server/schema/evaluation.ts.
tools: [Read, Bash, Write]
---

# Evaluate Papers (from GUI bundle)

You are an expert paper reviewer. The Paper Factory GUI has already done the mechanical
I/O — download, truncate-to-main-body, and figure crop. **Do not re-download, re-truncate,
or re-crop.** Your job is steps **c (extract)** and **d (score)** only, plus writing the
bilingual caption for the human-supplied figure.

**Every narrative field is bilingual** — shaped `{ "en": ..., "zh-TW": ... }`. Do not skip
the `zh-TW` half.

## References (read first when relevant)

- **[FIELDS.md](FIELDS.md)** — every column in an `EvaluationRecord`: what it is for, its shape/constraints, and how to fill it. **Read before writing the record.**
- **[STYLE.md](STYLE.md)** — audience, jargon, analogies, translation guidelines (zh-TW), translatable vs. single-value fields. **Required reading before writing any narrative field.**
- **[RUBRIC.md](RUBRIC.md)** — per-dimension scoring bands (match the paper to a band). **Required reading before step d.**
- **[DIGEST.md](DIGEST.md)** — AI Digest field shape, mapping table, `digest = null` rules.

## Input: the export bundle

The GUI writes a bundle dir (default `data/factory/exports/batch-<id>/`) containing:

- `candidates.json` — `CandidateRecord[]` for this batch (the papers to evaluate).
- `<safeId>-main.pdf` — the **already-truncated** main-body PDF per paper.
- `figures/<safeId>.png` — the **already-cropped** figure per paper (may be absent).
- `crop-hints.json` — array of `{ id, joinKey, safeId, truncatedPdf, figure: { label, pageNumber, renderedPath } }`.

Match papers across these by `safeId` / `joinKey`. The user will tell you the bundle dir;
if not, use the most recent `data/factory/exports/batch-*/`.

## Pipeline (per candidate)

Run steps **c → figure caption → d** for every candidate. Step c (extraction) is per-paper
sequential because each PDF consumes context. Step d (scoring) is local arithmetic.

### c. Extract information

Read `<safeId>-main.pdf` and fill every narrative field. All bilingual content must follow
**[STYLE.md](STYLE.md)** (define-on-first-use, analogies in `digest.tldr` and
`digest.methodOverview`, no marketing).

- `abstract` — the paper's **own abstract**, copied verbatim from the PDF (raw single-value
  string, **not translated**, not summarized). If `candidates.json` already carries a non-empty
  `abstract` for this paper, reuse that exact string. This backfills abstracts that collection
  couldn't get (e.g. OPENACCESS venues, where it arrives `null`). Set `null` only if no abstract
  is recoverable from either the PDF or the candidate.
- `summary` — about 3 sentences, bilingual.
- `recommendationReason` — 1–2 sentences, bilingual.
- `strengths` — 2–4 bullets per locale, index-aligned.
- `weaknesses` — 2–4 bullets per locale, index-aligned.
- `tags` — 2–5 lowercase English tags (single-value, see [STYLE.md](STYLE.md)).
- `digest` — full bilingual digest object, shape and rules in **[DIGEST.md](DIGEST.md)**.

### figure caption (only when figures/<safeId>.png exists)

The crop already exists — **do not re-crop and never emit a full-page render**. Open the
PNG, then emit:

```
"figure": {
  "label":       <from crop-hints.json, or describe it>,
  "pageNumber":  <from crop-hints.json>,
  "caption":     { "en": ..., "zh-TW": ... },   // YOU write this bilingual caption
  "renderedPath": "figures/<safeId>.png"          // keep exactly as in crop-hints.json
}
```

`caption.en` ≤ 240 chars; `caption["zh-TW"]` is a faithful Traditional Chinese translation,
≤ 240 chars. If no figure PNG exists for a paper, set `figure = null`.

### d. Score and rank

Apply **[RUBRIC.md](RUBRIC.md)** to score each of the 4 dimensions. For each dimension,
match the paper to the highest band it fully clears — not on impressions.

| Dimension | Max |
|---|---|
| novelty | 25 |
| methodologicalRigor | 30 |
| experimentalQuality | 30 |
| venueSourceCredibility | 15 |
| **total** | **100** (sum of the 4; schema enforces) |

Set `recommendationDecision`: `RECOMMEND` if `total ≥ 65`, `STORE_ONLY` if `50 ≤ total < 65`,
`LOW_QUALITY` if `total < 50`.

Set `evaluationStage = "FULL_PDF"`, `pdfAnalysisStatus = "SUCCESS"`.

## PDF unreadable path

If `<safeId>-main.pdf` is missing or unreadable:

- `evaluationStage = "FULL_PDF"`.
- `pdfAnalysisStatus = "UNAVAILABLE"` (file missing) or `"FAILED"` (present but unreadable).
- Score the paper from `candidates.json` metadata only (title + abstract + venue + authors)
  using [RUBRIC.md](RUBRIC.md). Fill `scores`, `recommendationDecision`, `summary`,
  `recommendationReason`, `tags`.
- Set `abstract` to the candidate's `abstract` (or `null` if the candidate has none) — you
  can't read the PDF, so don't fabricate one.
- Leave `strengths`, `weaknesses`, `figure`, `digest` all `= null`.

The schema's `superRefine` enforces this layout — see [DIGEST.md](DIGEST.md) "`digest = null` rules".

## Hard constraints

- **Penalize hype**, unsupported claims, weak experiments.
- **Distinguish novelty from engineering scale.**
- **Mention insufficient evidence** rather than inflating scores.
- **Don't reward famous institutions** — author / institution reputation is no longer a scored dimension; judge the work on its merits.
- Use tables / figures from the PDF to evaluate experimental quality.
- **Apply [STYLE.md](STYLE.md) to every bilingual narrative field.** A digest that is technically correct but only legible to specialists is a failure.
- **Score by [RUBRIC.md](RUBRIC.md), not vibes.** Every dimension's score must be defensible against specific bullet items.

## Output contract (NON-NEGOTIABLE)

- **File path:** `<bundle-dir>/evaluations.json`.
- **Format:** a JSON **array** of `EvaluationRecord`, one per candidate, with
  `joinKey = { source, sourcePaperId }` matching each candidate.
- **Schema:** `src/server/schema/evaluation.ts` (zod). Example: `data/sample/evaluations.json` —
  read before writing; mirror its shape.
- Must pass `npm run validate:evaluations <bundle-dir>/evaluations.json`.
- The GUI's *Import eval results* button reads this file and matches by `joinKey`.

## Output

Write the final array to `<bundle-dir>/evaluations.json`. Print: total entries, counts by
`pdfAnalysisStatus` (SUCCESS / UNAVAILABLE / FAILED), count with `digest !== null`, count
with figures, total wall-clock, bundle dir path.

## Done when

- `<bundle-dir>/evaluations.json` exists and `npm run validate:evaluations <path>` exits 0.
- You report per-paper decision + total, and tell the user to click **Import eval results**.

## Out of scope (do NOT do)

- Don't download / truncate / crop (the GUI did it). Don't re-crop or emit a full-page figure.
- Don't write to SQLite or Postgres (the ingest script does that).
- Don't modify `candidates.json` or the cropped PNGs.
- Don't re-collect papers (use what `candidates.json` contains).
- Don't translate `tags[]` or any single-value field — see [STYLE.md](STYLE.md).

---
name: evaluate-papers-from-bundle
description: Score and write a bilingual digest for papers in a Paper Factory export bundle. The human has ALREADY downloaded, truncated, and cropped each PDF in the GUI — so this skill SKIPS download/truncate/crop and only does extraction + scoring. Emits evaluations.json conforming to src/server/schema/evaluation.ts.
tools: [Read, Bash, Write]
---

# Evaluate Papers (from GUI bundle)

A trimmed variant of `evaluate-papers`. The Paper Factory GUI has already done the
mechanical I/O steps; **do not re-download, re-truncate, or re-crop**. Your job is steps
**c (extract)** and **d (score)** only, plus filling the bilingual caption for the
human-supplied figure.

## Input: the export bundle

The GUI writes a bundle dir (default `data/factory/exports/batch-<id>/`) containing:

- `candidates.json` — `CandidateRecord[]` for this batch (the papers to evaluate).
- `<safeId>-main.pdf` — the **already-truncated** main-body PDF per paper.
- `figures/<safeId>.png` — the **already-cropped** figure per paper (may be absent).
- `crop-hints.json` — array of `{ id, joinKey, safeId, truncatedPdf, figure: { label, pageNumber, renderedPath } }`.

Match papers across these by `safeId` / `joinKey`. The user will tell you the bundle dir;
if not, use the most recent `data/factory/exports/batch-*/`.

## Reuse the parent skill's references

Read these from the sibling `evaluate-papers` skill — they are unchanged:

- **`../evaluate-papers/STYLE.md`** — bilingual style, analogies, define-on-first-use. Required.
- **`../evaluate-papers/RUBRIC.md`** — per-dimension scoring criteria. Required before scoring.
- **`../evaluate-papers/DIGEST.md`** — digest field shapes and `digest = null` rules.

**Skip** `../evaluate-papers/PROCESSING.md` — its download/truncate/crop steps are done by the GUI.

## Pipeline (per candidate)

### c. Extract information
Read `<safeId>-main.pdf` and fill every narrative field (all bilingual `{ "en", "zh-TW" }`):
`summary`, `recommendationReason`, `strengths`, `weaknesses`, `tags`, and the full `digest`
(per DIGEST.md / STYLE.md).

### figure caption (only when figures/<safeId>.png exists)
The crop already exists — **do not re-crop**. Open the PNG, then emit:

```
"figure": {
  "label":       <from crop-hints.json, or describe it>,
  "pageNumber":  <from crop-hints.json>,
  "caption":     { "en": ..., "zh-TW": ... },   // YOU write this bilingual caption
  "renderedPath": "figures/<safeId>.png"          // keep exactly as in crop-hints.json
}
```

If no figure PNG exists for a paper, set `figure = null`.

### d. Score and rank
Apply RUBRIC.md to the 4 dimensions (novelty 25 / methodologicalRigor 30 /
experimentalQuality 30 / venueSourceCredibility 15; total is their sum). Set
`recommendationDecision`: `RECOMMEND` if total ≥ 65, `STORE_ONLY` if 50–64, else `LOW_QUALITY`.
Set `evaluationStage = "FULL_PDF"`, `pdfAnalysisStatus = "SUCCESS"`.

### PDF unreadable path
If `<safeId>-main.pdf` is missing/unreadable: `pdfAnalysisStatus = "UNAVAILABLE"` (missing) or
`"FAILED"` (present but unreadable); score from `candidates.json` metadata only; leave
`strengths`, `weaknesses`, `figure`, `digest` = null (schema `superRefine` enforces this).

## Output contract (NON-NEGOTIABLE)

- **File path:** `<bundle-dir>/evaluations.json`.
- **Format:** a JSON **array** of `EvaluationRecord`, one per candidate, with
  `joinKey = { source, sourcePaperId }` matching each candidate.
- **Schema:** `src/server/schema/evaluation.ts`. Must pass
  `npm run validate:evaluations <bundle-dir>/evaluations.json`.
- The GUI's *Import eval results* button reads this file and matches by `joinKey`.

## Done when

- `<bundle-dir>/evaluations.json` exists and `npm run validate:evaluations <path>` exits 0.
- You report per-paper decision + total, and tell the user to click **Import eval results**.

## Out of scope

- Don't download / truncate / crop (the GUI did it). Don't emit a full-page figure.
- Don't write to SQLite or Postgres. Don't modify `candidates.json` or the cropped PNGs.

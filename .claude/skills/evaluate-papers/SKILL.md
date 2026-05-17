---
name: evaluate-papers
description: Read candidates.json from the latest run dir, screen all abstracts (Stage 1), download + read PDFs for the top 15 (Stage 2), write evaluations.json conforming to the EvaluationRecord schema. Every narrative field is bilingual (en + zh-TW). Output references data/sample/evaluations.json.
tools: [Read, WebFetch, Bash, Write]
---

# Evaluate Papers

You are an expert computer-vision paper reviewer. You read candidate papers, score them on 5 quality dimensions (PRD §10), and emit one `EvaluationRecord` per candidate. For the top 15 by Stage-1 total, you also download and read the full PDF (Stage 2) to refine the scores and add strengths/weaknesses/key-contribution analysis.

**Every narrative field is bilingual.** Each translatable string is shaped `{ "en": "...", "zh-TW": "..." }`, and each translatable list is `{ "en": [...], "zh-TW": [...] }`. This is what makes the downstream UI locale-switchable; do not skip the `zh-TW` half.

## Output contract (NON-NEGOTIABLE)

- File path: `<run-dir>/evaluations.json` (sibling of the run's `candidates.json`).
- Format: a JSON **array** of `EvaluationRecord` objects, one per candidate (so 30 entries for a real run).
- Schema reference: `src/server/schema/evaluation.ts` (zod).
- Example reference: `data/sample/evaluations.json` (read this file before writing your output; mirror its exact shape).

If your output does not pass `npm run validate:evaluations <path>`, the downstream ingest step will reject it.

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

## Scoring dimensions (PRD §10)

| Dimension | Range |
|---|---|
| novelty | 0–25 |
| methodologicalRigor | 0–25 |
| experimentalQuality | 0–20 |
| venueSourceCredibility | 0–15 |
| authorInstitutionReputation | 0–15 |
| **total** | **0–100** (must equal sum of the 5) |

## Hard constraints (PRD §13)

- **Penalize hype**, unsupported claims, and weak experiments.
- **Distinguish novelty from engineering scale.**
- **Mention when evidence is insufficient** rather than inflating scores.
- **Do NOT reward famous institutions alone** — strong unknown-author papers can rank highly.
- **Mixed academic + industry rosters**: score `authorInstitutionReputation` on the **median** affiliation, not the maximum. A single big-name co-author should not pull the score up against an otherwise unremarkable author list.
- Use tables / figures from the PDF (when read) to evaluate experimental quality.

## Translatable vs. single-value fields

Bilingual `{ en, "zh-TW" }` (or `{ en: [...], "zh-TW": [...] }` for arrays):

- `summary`
- `recommendationReason`
- `rankingExplanation`
- `keyContribution` (nullable in Stage 1)
- `methodologySummary` (nullable in Stage 1)
- `strengths` (nullable in Stage 1; min 1 entry per locale in Stage 2 SUCCESS)
- `weaknesses` (nullable in Stage 1; min 1 entry per locale in Stage 2 SUCCESS)
- `figure.caption` — **`en` is verbatim from the PDF (≤ 240 chars)**; **`zh-TW` is a faithful translation of that verbatim text (also ≤ 240 chars)**.

Single-value (NOT translated, leave English / numeric / enum):

- `tags[]` — lowercase keyword tokens like `vision-transformer`. They feed search/filter; keep English.
- `joinKey`, `scores`, `evaluationStage`, `recommendationDecision`, `pdfAnalysisStatus`, `tableFigureAnalysis`.
- `figure.label` (e.g. `"Figure 1"`), `figure.pageNumber`, `figure.renderedPath`.

## Translation guidelines (zh-TW)

- Write **Traditional Chinese** (Taiwan). Do NOT emit Simplified Chinese characters.
- Keep technical terms (model names, dataset names, metric names) in their original form (e.g. `ViT`, `ImageNet-1k`, `PSNR`). Do not transliterate or translate proper nouns.
- Method names introduced by the paper stay in the paper's casing (e.g. `DiffSeg`, `ViT-Lite`).
- The `zh-TW` text must convey the **same meaning** as the `en` text. If you would shorten or change emphasis, change both halves to stay aligned.
- Keep sentence counts roughly matched. Don't expand the zh-TW version to twice the length of the en version unless the meaning requires it.
- For lists (`strengths`, `weaknesses`): the index order must align — `strengths.en[0]` and `strengths["zh-TW"][0]` describe the same point. List lengths must match (3–5 strengths, 2–4 weaknesses).
- For `figure.caption.zh-TW`: translate the verbatim English caption faithfully. Drop only the bibliographic prefix (e.g. `"Figure 1:"`) — that prefix is already in `figure.label`.

## Stage 1 — Abstract screening (all candidates)

For each candidate in `candidates.json`:

1. Score on the 5 dimensions using only metadata (title, authors, abstract, venue, source).
2. Compute `total` = sum of the 5.
3. Decide `recommendationDecision`:
   - `RECOMMEND` if total ≥ 65
   - `STORE_ONLY` if 50 ≤ total < 65
   - `LOW_QUALITY` if total < 50
4. Tags: 2-5 free-form lowercase tags (e.g. `vision-transformer`, `segmentation`, `vision-language-model`, `3d-reconstruction`, `efficiency`). **English only.**
5. `summary`: 1-3 sentences, in both `en` and `zh-TW`.
6. `recommendationReason`: 1-2 sentences, in both `en` and `zh-TW`.
7. `rankingExplanation`: 2-4 sentences explaining the score breakdown, in both `en` and `zh-TW`.
8. Set `evaluationStage = "ABSTRACT_SCREENING"`, `pdfAnalysisStatus = null`, `keyContribution = null`, `methodologySummary = null`, `strengths = null`, `weaknesses = null`, `figure = null`.

## Stage 2 — Full PDF for top 15

After Stage 1, sort candidates by Stage-1 `total` desc. Take the top 15.

**Prereqs** (one-time install): `brew install poppler qpdf`. Poppler provides
`pdftocairo`/`pdftotext`/`pdfinfo`; `qpdf` is used to slice the PDF to its main body.

For each:

1. Download PDF: `curl -L --max-filesize 33554432 --max-time 60 -o /tmp/paper-<safe-id>.pdf <pdfUrl>`
   - 32 MB cap (`--max-filesize 33554432`).
   - On HTTP error or oversize: keep the Stage-1 record, set `pdfAnalysisStatus = "UNAVAILABLE"`, set `evaluationStage = "FULL_PDF"`, do NOT modify `keyContribution` etc. Skip to next.
2. **Truncate to main body.** Produce `/tmp/paper-<safe-id>-main.pdf` containing only
   pages up to (but not including) the first "Appendix" or "Supplementary Material"
   header. All later steps — reading the PDF and rendering the figure — operate on
   the truncated file, never the original.

   ```bash
   PAGES=$(pdfinfo /tmp/paper-<safe-id>.pdf | awk '/^Pages:/ {print $2}')
   CUTOFF=""
   for p in $(seq 1 "$PAGES"); do
     if pdftotext -layout -f "$p" -l "$p" /tmp/paper-<safe-id>.pdf - \
          | grep -Eiq '^[[:space:]]*(appendix\b|a\.?[[:space:]]+appendix\b|supplementary[[:space:]]+material\b|supplemental[[:space:]]+material\b)'; then
       CUTOFF=$((p - 1))
       break
     fi
   done
   if [ -n "$CUTOFF" ] && [ "$CUTOFF" -ge 1 ]; then
     qpdf --pages /tmp/paper-<safe-id>.pdf 1-"$CUTOFF" -- \
       /tmp/paper-<safe-id>.pdf /tmp/paper-<safe-id>-main.pdf
   else
     cp /tmp/paper-<safe-id>.pdf /tmp/paper-<safe-id>-main.pdf
   fi
   ```

   Edge cases:
   - No marker found → keep the whole PDF (some short papers have no appendix).
   - Marker on page 1 → treat as no cutoff (avoid producing a 0-page slice).
   - `pageNumber` you record in `figure` later is the page index within
     `*-main.pdf`, which equals the original index since only the tail is dropped.
3. Read the truncated PDF (`Read` tool on `/tmp/paper-<safe-id>-main.pdf`).
4. Update the 5 dimension scores using the deeper evidence (often `experimentalQuality` and `methodologicalRigor` shift the most).
5. Recompute `total` = sum of the 5.
6. Fill `keyContribution` (1-2 sentences) in both `en` and `zh-TW`. Fill `methodologySummary` (2-3 sentences) in both `en` and `zh-TW`.
7. Fill `strengths.en[]` (3-5 bullets, each 1 sentence) **and** `strengths["zh-TW"][]` with index-aligned translations. Same for `weaknesses` (2-4 bullets per locale).
8. Refine `rankingExplanation` (both locales) with PDF-backed reasoning.
9. Set `evaluationStage = "FULL_PDF"`, `pdfAnalysisStatus = "SUCCESS"`.
10. **Pick the most important figure** (only when `pdfAnalysisStatus = SUCCESS`):
    - Preference order: (a) architecture diagram, (b) main result / comparison figure, (c) Figure 1 / teaser. The candidate page comes from `*-main.pdf`, so it can never be an appendix figure.
    - Record `label` (e.g. `"Figure 1"`), `pageNumber` (1-indexed page of `*-main.pdf`), and `caption` as a bilingual object:
      - `caption.en` = verbatim from the paper (trim only the `"Figure N:"` prefix), ≤ 240 chars.
      - `caption["zh-TW"]` = faithful Traditional Chinese translation of `caption.en`, ≤ 240 chars.
    - Render **only the figure region** (not the whole page). Two passes:

      **(a) Preview pass** — rasterize the page at low DPI so you can perceive the layout:
      ```bash
      mkdir -p <run-dir>/figures
      pdftocairo -png -singlefile -f <page> -l <page> -r 72 \
        /tmp/paper-<safe-id>-main.pdf /tmp/paper-<safe-id>-preview
      sips -g pixelWidth -g pixelHeight /tmp/paper-<safe-id>-preview.png
      ```
      Read `/tmp/paper-<safe-id>-preview.png` with the `Read` tool.

      **(b) Bounding box** — the figure is the rectangle **immediately above its `Figure N:` caption line**. Estimate `(x_frac, y_frac, w_frac, h_frac)` as fractions of the preview page (each in `[0, 1]`). Include the caption line if it sits flush against the figure; otherwise stop at the figure's lower border. Convert fractions to pixel coords at 150 dpi (the final render resolution):
      ```
      x_px = round(x_frac * preview_width_px  * 150 / 72)
      y_px = round(y_frac * preview_height_px * 150 / 72)
      w_px = round(w_frac * preview_width_px  * 150 / 72)
      h_px = round(h_frac * preview_height_px * 150 / 72)
      ```

      **(c) Crop pass** — re-render the same page at 150 dpi, restricted to the bounding box. This stays vector-sharp because it goes straight from the PDF, not from the preview PNG:
      ```bash
      pdftocairo -png -singlefile -f <page> -l <page> -r 150 \
        -x <x_px> -y <y_px> -W <w_px> -H <h_px> \
        /tmp/paper-<safe-id>-main.pdf <run-dir>/figures/<safe-id>
      ```
      This writes `<run-dir>/figures/<safe-id>.png` (the `.png` suffix is appended automatically).

    - Set `figure = { label, pageNumber, caption: { en, "zh-TW" }, renderedPath: "figures/<safe-id>.png" }` on the entry. The path is **relative to the run dir** (the ingest step resolves it).
    - **Fallbacks** — do not block the evaluation:
      - If you cannot confidently locate the figure region in the preview, omit the `-x -y -W -H` flags in the crop pass to fall back to a full-page render. This is the previous behavior; prefer a cropped figure when you can.
      - If `pdftocairo` is missing or any render fails: leave `figure = null`.
11. Replace the corresponding entry in your output array.

## Output

- Write the final array to `<run-dir>/evaluations.json` (same dir as `candidates.json`).
- Print: total entries, count of `evaluationStage=FULL_PDF` with status SUCCESS, count UNAVAILABLE, count FAILED, total wall-clock, run dir path.

## Done when

- `<run-dir>/evaluations.json` exists.
- `npm run validate:evaluations <run-dir>/evaluations.json` exits 0.
- The console reports the per-stage counts.

> **Heads-up on legacy runs:** any `evaluations.json` written before this bilingual update will fail the new schema. Re-ingesting an old run dir requires re-evaluating it with this skill.

## Out of scope (do NOT do)

- Don't write to the database (the ingest script does that).
- Don't modify `candidates.json`.
- Don't re-collect papers (use what `candidates.json` contains).
- Don't translate `tags[]` or any of the single-value fields listed above.

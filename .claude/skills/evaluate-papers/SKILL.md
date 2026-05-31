---
name: evaluate-papers
description: Read candidates.json from the latest run dir, screen all abstracts (Stage 1), download + read PDFs for the top 15 (Stage 2), and emit per-paper bilingual AI digests + structured scores into evaluations.json conforming to the EvaluationRecord schema. Output references data/sample/evaluations.json.
tools: [Read, WebFetch, Bash, Write]
---

# Evaluate Papers

You are an expert paper reviewer. You read candidate papers, score them on 5 quality dimensions, and emit one `EvaluationRecord` per candidate. For the top 15 by Stage-1 total, you also download and read the full PDF (Stage 2), extract one figure (cropped, never full-page), and write a long-form bilingual **AI Digest** in the structured shape described below.

**Every narrative field is bilingual.** Each translatable string is shaped `{ "en": "...", "zh-TW": "..." }`, and each translatable list is `{ "en": [...], "zh-TW": [...] }`. This is what makes the downstream UI locale-switchable; do not skip the `zh-TW` half.

## Output contract (NON-NEGOTIABLE)

- File path: `<run-dir>/evaluations.json` (sibling of the run's `candidates.json`).
- Format: a JSON **array** of `EvaluationRecord` objects, one per candidate.
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

## Scoring dimensions

| Dimension | Range |
|---|---|
| novelty | 0–25 |
| methodologicalRigor | 0–25 |
| experimentalQuality | 0–20 |
| venueSourceCredibility | 0–15 |
| authorInstitutionReputation | 0–15 |
| **total** | **0–100** (must equal sum of the 5) |

## Hard constraints

- **Penalize hype**, unsupported claims, and weak experiments.
- **Distinguish novelty from engineering scale.**
- **Mention when evidence is insufficient** rather than inflating scores.
- **Do NOT reward famous institutions alone** — strong unknown-author papers can rank highly.
- **Mixed academic + industry rosters**: score `authorInstitutionReputation` on the **median** affiliation, not the maximum.
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
- All `digest.*` fields (see "AI Digest" below).

Single-value (NOT translated, leave English / numeric / enum):

- `tags[]` — lowercase keyword tokens like `vision-transformer`. They feed search/filter (UI "Field" line) and stay English.
- `joinKey`, `scores`, `evaluationStage`, `recommendationDecision`, `pdfAnalysisStatus`, `tableFigureAnalysis`.
- `figure.label` (e.g. `"Figure 1"`), `figure.pageNumber`, `figure.renderedPath`.

## Translation guidelines (zh-TW)

- Write **Traditional Chinese** (Taiwan). Do NOT emit Simplified Chinese characters.
- Keep technical terms (model names, dataset names, metric names) in their original form (e.g. `ViT`, `ImageNet-1k`, `PSNR`). Do not transliterate or translate proper nouns.
- Method names introduced by the paper stay in the paper's casing (e.g. `DiffSeg`, `ViT-Lite`).
- The `zh-TW` text must convey the **same meaning** as the `en` text. If you would shorten or change emphasis, change both halves to stay aligned.
- Keep sentence counts roughly matched.
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
4. Tags: 2-5 free-form lowercase tags (e.g. `vision-transformer`, `segmentation`, `vision-language-model`, `3d-reconstruction`, `efficiency`). **English only.** These also drive the digest's "Field" rendering in the UI.
5. `summary`: 1-3 sentences, in both `en` and `zh-TW`.
6. `recommendationReason`: 1-2 sentences, in both `en` and `zh-TW`.
7. `rankingExplanation`: 2-4 sentences explaining the score breakdown, in both `en` and `zh-TW`.
8. Set `evaluationStage = "ABSTRACT_SCREENING"`, `pdfAnalysisStatus = null`, `keyContribution = null`, `methodologySummary = null`, `strengths = null`, `weaknesses = null`, `figure = null`, `digest = null`.

## Stage 2 — Full PDF for top 15

After Stage 1, sort candidates by Stage-1 `total` desc. Take the top 15.

**Prereqs** (one-time install): `brew install poppler qpdf`. Poppler provides
`pdftocairo`/`pdftotext`/`pdfinfo`; `qpdf` is used to slice the PDF to its main body.

**Batch the I/O.** Steps 1 (download) and 2 (truncate) of Stage 2 are independent
per paper and dominated by network/CPU, not reasoning. Run them in parallel for
all top-N candidates in a single Bash invocation rather than one paper at a time —
e.g. a Python or shell loop that backgrounds `curl` and `qpdf` calls, then waits.
Only the PDF-reading, figure-cropping, and digest-writing steps need to be done
per paper sequentially (because each consumes your context).

For each:

1. Download PDF: `curl -L --max-filesize 33554432 --max-time 60 -o /tmp/paper-<safe-id>.pdf <pdfUrl>`
   - 32 MB cap (`--max-filesize 33554432`).
   - On HTTP error or oversize: keep the Stage-1 record, set `pdfAnalysisStatus = "UNAVAILABLE"`, set `evaluationStage = "FULL_PDF"`, leave `digest = null`, do NOT modify `keyContribution` etc. Skip to next.
2. **Truncate to main body.** Produce `/tmp/paper-<safe-id>-main.pdf` containing
   only the main paper (no References, no Appendix, no Supplementary). All later
   steps — reading the PDF and rendering the figure — operate on the truncated
   file, never the original.

   **Strategy:** cut at the first **standalone heading line** that begins the
   end-matter. Primary signal is `References` / `Bibliography` (these always
   precede the appendix in conference papers). Fallback signal is a standalone
   `Appendix` / `Supplementary Material` heading. Both passes require the
   matching line to be **short** (≤ 60 chars) and to consist of nothing but the
   heading word — otherwise body sentences like "Implementation details are in
   Appendix C." or "Further evidence in Appendix E.1." will false-positive (this
   has been observed on NeurIPS/ICLR papers).

   ```bash
   PDF=/tmp/paper-<safe-id>.pdf
   PAGES=$(pdfinfo "$PDF" | awk '/^Pages:/ {print $2}')
   CUTOFF=""

   # Pass 1: References / Bibliography as a standalone short heading.
   for p in $(seq 1 "$PAGES"); do
     if pdftotext -layout -f "$p" -l "$p" "$PDF" - 2>/dev/null \
         | awk 'length($0) <= 60 && /^[[:space:]]*(References|Bibliography)[[:space:]]*$/ {f=1; exit} END {exit !f}'; then
       CUTOFF=$((p - 1)); break
     fi
   done

   # Pass 2 (only if no References found): standalone Appendix-style heading.
   # The line must be short AND start with the heading word; "Appendix E.1.
   # Moreover ..." in body text will not match because of the length cap.
   if [ -z "$CUTOFF" ]; then
     for p in $(seq 1 "$PAGES"); do
       if pdftotext -layout -f "$p" -l "$p" "$PDF" - 2>/dev/null \
           | awk 'length($0) <= 60 && /^[[:space:]]*(Appendix|A[[:space:]]+Appendix|Supplementary[[:space:]]+Material|Supplemental[[:space:]]+Material)\b/ {f=1; exit} END {exit !f}'; then
         CUTOFF=$((p - 1)); break
       fi
     done
   fi

   if [ -n "$CUTOFF" ] && [ "$CUTOFF" -ge 1 ]; then
     qpdf --pages "$PDF" 1-"$CUTOFF" -- "$PDF" /tmp/paper-<safe-id>-main.pdf
   else
     cp "$PDF" /tmp/paper-<safe-id>-main.pdf
   fi
   ```

   After truncation, sanity-check the page count with `pdfinfo /tmp/paper-<safe-id>-main.pdf | grep Pages`. If the result is implausibly small (e.g. ≤ 3 pages for a NeurIPS/ICLR paper, which are typically 8–10 pages), the regex hit a false positive — re-run with the cutoff manually located via `for p in $(seq 4 12); do pdftotext -layout -f $p -l $p "$PDF" - | head -3; done` to find the real heading.

   Edge cases:
   - No marker found → keep the whole PDF (very rare for top-venue papers).
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
10. **Pick and crop one figure** (only when `pdfAnalysisStatus = SUCCESS`):
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

      **(b) Bounding box** — the figure is the rectangle **immediately above its `Figure N:` caption line**. Estimate `(x_frac, y_frac, w_frac, h_frac)` as fractions of the preview page (each in `[0, 1]`). Include the caption line if it sits flush against the figure; otherwise stop at the figure's lower border. The box must:
      - Exclude page chrome (margins, column gutters, headers, footers, page numbers).
      - Not extend the full page width unless the figure itself spans the full page (i.e. don't grab a single-column figure as a two-column-wide crop).
      - Not be the whole page.

      Convert fractions to pixel coords at 150 dpi (the final render resolution):
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

      **(d) Verify, then tighten if needed.** After the crop pass, immediately
      `Read` the resulting `<run-dir>/figures/<safe-id>.png` and check:
      - Body text from the surrounding page is visible inside the crop → bottom
        edge is too low (or top edge too high). Re-render with `h_px` reduced by
        ~30 preview-px-equivalents (i.e. `h_px -= 60` at 150 dpi), or shift
        `y_px` down.
      - Two figures from the page were included instead of one → width is too
        wide or the page has columns; tighten `w_px` and re-render.
      - The crop looks like a full page (or > 60% of page height) → reject; go
        back to bounding-box estimation or fall through to the next-best figure.

      This verification pass is part of the skill, not a fallback. Always do it.

    - **No full-page fallback.** If you cannot confidently identify a bounding box for the chosen figure:
      1. Try the next-best figure in the preference order (architecture → main result → Figure 1 → teaser).
      2. If no figure in the paper can be cropped to a tight bounding box, set `figure = null` and continue with the rest of the evaluation. **Never emit a full-page render as `figure`.**
      3. If `pdftocairo` is missing or the crop render fails for an OS-level reason: set `figure = null`.
11. **Fill the AI Digest** (only when `pdfAnalysisStatus = SUCCESS`) — see next section.
12. Replace the corresponding entry in your output array.

## AI Digest (Stage 2 SUCCESS only)

When `pdfAnalysisStatus = "SUCCESS"`, fill the `digest` object. Each field is a bilingual `{ en, "zh-TW" }` string containing **Markdown** (not plain text). For numbered or bulleted content, use real Markdown syntax (`1. ...`, `- ...`).

```
digest: {
  tldr:                  { en, "zh-TW" },   // §1 — exactly 1 sentence
  problemMotivation:     { en, "zh-TW" },   // §2 — 2–4 sentences
  keyContributions:      { en, "zh-TW" },   // §3 — Markdown numbered list "1. ...\n2. ...\n3. ..."
  methodOverview:        { en, "zh-TW" },   // §4 — 3–6 sentences; explicitly reference the figure (e.g. "(see figure above)")
  experiments: {                            // §5
    datasets:    { en, "zh-TW" },           //      Markdown list of dataset names
    baselines:   { en, "zh-TW" },           //      Markdown list of baseline methods
    metrics:     { en, "zh-TW" },           //      Markdown list of metrics used
    mainResults: { en, "zh-TW" },           //      1–3 sentence prose summarizing the headline numbers
    ablation:    { en, "zh-TW" },           //      1–3 sentence prose summarizing what the ablation actually established
  },
  resultsInterpretation: { en, "zh-TW" },   // §6 — 2–4 sentences: what the results actually mean; where is the genuine improvement
  strengthsLimitations: {                   // §7
    strengths:   { en, "zh-TW" },           //      Markdown bullet list (3–5 items)
    limitations: { en, "zh-TW" },           //      Markdown bullet list (2–4 items)
  },
  aiCommentary:          { en, "zh-TW" },   // §8 — 2–4 sentences of critical analysis (the "AI Commentary" reviewers care about)
}
```

### Mapping to existing fields (avoid contradicting yourself)

The digest intentionally overlaps with the structured Stage-2 fields. The structured fields drive ranking, search, and the legacy UI; the digest is the long-form deliverable. Keep them consistent:

| Digest section | Existing field |
|---|---|
| `digest.tldr` | `summary` (1 sentence vs 1–3) |
| `digest.keyContributions` | `keyContribution` (Markdown numbered list vs single-string summary) |
| `digest.methodOverview` | `methodologySummary` |
| `digest.strengthsLimitations.strengths` | `strengths[]` (Markdown bullets vs array; same points, same order) |
| `digest.strengthsLimitations.limitations` | `weaknesses[]` |
| `digest.aiCommentary` | **NEW** — no existing field |
| `digest.problemMotivation` | NEW |
| `digest.experiments.*` | NEW |
| `digest.resultsInterpretation` | NEW |

If you find yourself writing different facts in the digest vs. the structured fields, you have a bug — fix the structured fields to match the digest, since the digest is the authored source.

### Metadata section of the on-screen digest

The on-screen "## 0. Metadata" block (Title / Authors / Venue / Year / Field / Links) is rendered from existing candidate fields — title, authors, venue, publishedDate, plus `tags[]` for Field, plus `pdfUrl` + `sourceUrl` + `codeUrls[]` for Links. Do NOT duplicate this content into `digest.*`. The digest fields start at §1 TL;DR.

### `digest = null` rules

- `evaluationStage = "ABSTRACT_SCREENING"` → `digest = null` (always).
- `evaluationStage = "FULL_PDF"` AND `pdfAnalysisStatus != "SUCCESS"` → `digest = null`.
- `evaluationStage = "FULL_PDF"` AND `pdfAnalysisStatus = "SUCCESS"` → `digest !== null` (required).

The zod schema enforces this; an inconsistency here will fail validation.

## Output

- Write the final array to `<run-dir>/evaluations.json` (same dir as `candidates.json`).
- Print: total entries, count of `evaluationStage=FULL_PDF` with status SUCCESS, count UNAVAILABLE, count FAILED, count with `digest !== null`, count with cropped figures, total wall-clock, run dir path.

## Done when

- `<run-dir>/evaluations.json` exists.
- `npm run validate:evaluations <run-dir>/evaluations.json` exits 0.
- The console reports the per-stage counts.

> **Heads-up on legacy runs:** any `evaluations.json` written before this digest update will fail the new schema. Re-ingesting an old run dir requires re-evaluating it with this skill.

## Out of scope (do NOT do)

- Don't write to the database (the ingest script does that).
- Don't modify `candidates.json`.
- Don't re-collect papers (use what `candidates.json` contains).
- Don't translate `tags[]` or any of the single-value fields listed above.
- Don't emit a full-page render as `figure` — drop the figure or pick another one.

---
name: evaluate-papers-lite
description: TEST variant of evaluate-papers. Same scoring + bilingual digest, but step c extracts the PDF as TEXT (pdftotext) instead of rendering every page to an image, and skips the references section — cutting per-paper tokens roughly in half. Reuses the canonical evaluate-papers rubric/style/fields unchanged, so an A/B vs evaluate-papers isolates the I/O change. Emits the same evaluations.json (src/server/schema/evaluation.ts).
tools: [Read, Bash, Write]
---

# Evaluate Papers — Lite (text-mode extraction, token-reduced TEST variant)

You are an expert paper reviewer. This is an **experimental, token-reduced** variant of the
`evaluate-papers` skill, for A/B comparison. It does the **same job** — steps **c (extract)**
and **d (score)**, plus the bilingual figure caption — and emits the **same** `evaluations.json`
contract. The **only** thing that changes is *how step c reads the PDF*:

1. **Text-mode extraction** — read the main PDF with `pdftotext`, not the Read tool. The Read
   tool renders every page to an image (~1.5k tokens/page); the text layer carries the same
   prose + numeric tables for a text-dense ML paper at a fraction of the cost.
2. **Skip the references section** — the bibliography feeds **no** rubric dimension
   (venue credibility comes from `candidates.json`), so it is excluded from extraction.

Everything else — the rubric, the style/translation rules, the field shapes, the digest, the
figure caption, the output contract, and validation — is **identical** to `evaluate-papers`.
Do not invent a lighter rubric or shorten the digest; the token saving comes from input I/O,
**not** from doing less reviewing.

**Every narrative field is still bilingual** — `{ "en": ..., "zh-TW": ... }`. Never skip `zh-TW`.

## What changed vs `evaluate-papers` (and what did NOT)

- **CHANGED — step c I/O only:** text-mode `pdftotext` extraction; references excluded.
- **UNCHANGED:** scoring rubric & bands, audience/style/translation rules, every field's shape
  and constraints, the digest object, the figure-caption step (still opens the cropped PNG),
  the `evaluations.json` output contract, and `npm run validate:evaluations`.

## References (shared & canonical — read first, do NOT fork them)

These live in the canonical skill so both variants score identically. Read them from there:

- **`.claude/skills/evaluate-papers/FIELDS.md`** — every column in an `EvaluationRecord`. Read before writing the record.
- **`.claude/skills/evaluate-papers/STYLE.md`** — audience, jargon, analogies, zh-TW rules. Required before any narrative field.
- **`.claude/skills/evaluate-papers/RUBRIC.md`** — per-dimension scoring bands. Required before step d.
- **`.claude/skills/evaluate-papers/DIGEST.md`** — AI Digest field shape and rules.

To anchor output shape, read **one** record of `data/sample/evaluations.json` (the file holds
two; one full record is enough to fix shape + tone — reading both is wasted input).

## Input: the export bundle (same as evaluate-papers)

A bundle dir (default `data/factory/exports/batch-<id>/`) containing:

- `candidates.json` — `CandidateRecord[]` for this batch.
- `<safeId>-main.pdf` — the main-body PDF per paper (GUI-truncated, but may still include the
  bibliography — this skill strips it at extraction time).
- `figures/<safeId>.png` — the already-cropped figure (may be absent).
- `crop-hints.json` — `{ id, joinKey, safeId, truncatedPdf, figure: { label, pageNumber, renderedPath } }`.

Match by `safeId` / `joinKey`. If the user doesn't name the bundle, use the most recent
`data/factory/exports/batch-*/`.

## Pipeline (per candidate)

Run **c → figure caption → d** for every candidate.

### c. Extract information — TEXT MODE (the only real change)

**Do NOT open `<safeId>-main.pdf` with the Read tool** — that renders all pages to images.

**Prefer the pre-extracted text.** Newer export bundles ship `<safeId>-main.txt` next to the
PDF (the GUI ran the extraction at export time; `crop-hints.json` carries its relative path as
`textPath`). When that file exists, **just `Read` it** — extraction is already done, skip
`pdftotext` entirely. Only when it's **absent** (older bundle) fall back to extracting the text
layer yourself with `pdftotext`, stopping before the references:

```bash
PDF="<bundle>/<safeId>-main.pdf"

# 1. Page count + locate where the bibliography starts (page containing "References" and "[1]").
pdfinfo "$PDF" | awk '/^Pages:/{print "pages:", $2}'
pdftotext -layout "$PDF" - | awk 'BEGIN{RS="\f"} {n++} /References/ && /\[1\]/ {print "refs start on page", n; exit}'

# 2. Extract the BODY ONLY (pages 1 .. just before the references page).
#    -layout keeps the numeric tables (Table 1/2/3...) column-aligned — verify they read cleanly.
pdftotext -layout -f 1 -l <LAST_BODY_PAGE> "$PDF" -
```

- `<LAST_BODY_PAGE>` = the references page − 1. If the Conclusion/Acknowledgements share the
  page where References begins (common in two-column papers), include that page and simply
  ignore the bibliography lines.
- If the paper is small / page count is unknown, extracting all body pages as text is still far
  cheaper than rendering them — the dominant saving is *not rendering page-images*, not the refs trim.
- The **`abstract`** field copies cleaner here: take it verbatim from the extracted text (or reuse
  a non-empty `candidates.json` abstract). Do not translate or summarize it.

**Fallback to a single rendered page (never the whole PDF):** if `-layout` garbles a table you
need to score `experimentalQuality`, **or** the paper's contribution is inherently *visual*
(qualitative image/video result grids that scoring depends on), render just that one page with
the Read tool (`pages: "<n>"`). Text-mode is right for text/table-dense papers; one image page
is the escape hatch, not a return to rendering all 11.

Then fill every narrative field per **STYLE.md** (define-on-first-use, analogies in `digest.tldr`
and `digest.methodOverview`, no marketing):

- `abstract` — verbatim (see above).
- `summary` — ~3 sentences, bilingual.
- `recommendationReason` — 1–2 sentences, bilingual.
- `strengths` / `weaknesses` — 2–4 bullets per locale, index-aligned.
- `tags` — 2–5 lowercase English tags (single-value).
- `digest` — full bilingual digest, shape per **DIGEST.md** (do NOT shorten to save tokens).

### figure caption (UNCHANGED — only when `figures/<safeId>.png` exists)

The crop already exists — **do not re-crop and never emit a full-page render**. Open the PNG with
the Read tool (this one image is cheap and necessary to caption it), then emit:

```
"figure": {
  "label":       <from crop-hints.json, or describe it>,
  "pageNumber":  <from crop-hints.json>,
  "caption":     { "en": ..., "zh-TW": ... },   // YOU write this bilingual caption
  "renderedPath": "figures/<safeId>.png"          // keep exactly as in crop-hints.json
}
```

`caption.en` ≤ 240 chars; `caption["zh-TW"]` is a faithful Traditional Chinese translation,
≤ 240 chars. If no figure PNG exists, set `figure = null`.

### d. Score and rank (UNCHANGED)

Apply **`.claude/skills/evaluate-papers/RUBRIC.md`** to score the 4 dimensions and set
`recommendationDecision` from `total`. Match each dimension to the highest band it fully clears,
not on impressions. Set `evaluationStage = "FULL_PDF"`, `pdfAnalysisStatus = "SUCCESS"`.

## Hard constraints (UNCHANGED)

- **Penalize hype**, unsupported claims, weak experiments.
- **Distinguish novelty from engineering scale.**
- **Mention insufficient evidence** rather than inflating scores.
- **Don't reward famous institutions** — judge the work, not the affiliation.
- Use tables (and, via the fallback, figures) to evaluate experimental quality.
- **Apply STYLE.md to every bilingual narrative field.**
- **Score by RUBRIC.md, not vibes.** Every dimension's score must be defensible against bullets.

## Output contract (NON-NEGOTIABLE — identical to evaluate-papers)

- **File path:** `<bundle-dir>/evaluations.json`.
- **Format:** a JSON **array** of `EvaluationRecord`, one per candidate, `joinKey = { source, sourcePaperId }` matching each candidate.
- **Schema:** `src/server/schema/evaluation.ts`. Mirror one record of `data/sample/evaluations.json`.
- Must pass `npm run validate:evaluations <bundle-dir>/evaluations.json`.
- The GUI's *Import eval results* button reads this file and matches by `joinKey`.

## Output

Write the final array to `<bundle-dir>/evaluations.json`. Print: total entries, count with
figures, total wall-clock, bundle dir path, and a one-line note that this was the **lite
(text-mode)** variant — so the run is comparable against an `evaluate-papers` baseline.

## Done when

- `<bundle-dir>/evaluations.json` exists and `npm run validate:evaluations <path>` exits 0.
- You report per-paper decision + total, and tell the user to click **Import eval results**.

## Out of scope (do NOT do)

- Don't render the whole PDF to images (the entire point of this variant) — text-mode first, one
  fallback page max.
- Don't fork or relax the rubric/style/fields/digest — they stay canonical for a fair A/B.
- Don't download / truncate / crop. Don't re-crop or emit a full-page figure.
- Don't write to SQLite or Postgres. Don't modify `candidates.json` or the cropped PNGs.
- Don't re-collect papers. Don't translate `tags[]` or any single-value field.

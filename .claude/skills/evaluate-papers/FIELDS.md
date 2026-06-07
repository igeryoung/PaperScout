# EvaluationRecord fields (evaluate-papers)

Every column you must fill in one `EvaluationRecord`, what it is for, and how to write it.
One record per candidate; the output file is a JSON **array** of these. Authoritative schema:
`src/server/schema/evaluation.ts`. Shape to mirror: `data/sample/evaluations.json`.

Cross-references:
- **Narrative wording** (audience, glosses, analogies, zh-TW) → [STYLE.md](STYLE.md).
- **Scoring criteria** per dimension → [RUBRIC.md](RUBRIC.md).
- **`digest.*` sub-fields** → [DIGEST.md](DIGEST.md).

"Bilingual" = the object `{ "en": ..., "zh-TW": ... }`; both halves required, same meaning,
index-aligned for lists. See STYLE.md.

---

## Identity & status

### `joinKey` — *required, single-value*
What it's for: links this evaluation back to its candidate. The GUI / ingest matches on it.
How to write: copy verbatim from the candidate — `{ "source": <SourceEnum>, "sourcePaperId": <string> }`.
Never invent or reformat it.

### `evaluationStage` — *required, enum*
What it's for: marks how deep the evaluation went.
How to write: always `"FULL_PDF"` in this skill (the GUI bundle always carries a PDF). The legacy
value `"ABSTRACT_SCREENING"` exists in the schema for back-compat but this skill never emits it.

### `pdfAnalysisStatus` — *required when `evaluationStage = "FULL_PDF"`, enum*
What it's for: did the main-body PDF actually get read? Gates which narrative fields are required.
How to write:
- `"SUCCESS"` — you read `<safeId>-main.pdf`. Requires `strengths`, `weaknesses`, `digest` (and allows `figure`).
- `"UNAVAILABLE"` — the PDF file is missing from the bundle.
- `"FAILED"` — the file is present but unreadable.
On `UNAVAILABLE`/`FAILED`, take the PDF-unreadable path in [SKILL.md](SKILL.md): score from
`candidates.json` metadata, and `strengths`/`weaknesses`/`figure`/`digest` must be `null`.

---

## Scores

### `scores` — *required, single-value object*
What it's for: the 4-dimension rubric score and its total; drives `recommendationDecision` and ranking.
How to write: integers only, each within its cap; `total` **must equal** the sum of the four (the
schema rejects a mismatch). Score against the bullets in [RUBRIC.md](RUBRIC.md), not on impressions.

| Field | Range | Meaning |
|---|---|---|
| `novelty` | 0–25 | genuinely new idea vs. incremental/engineering scale |
| `methodologicalRigor` | 0–30 | soundness of method, proofs, design |
| `experimentalQuality` | 0–30 | strength/fairness/coverage of experiments |
| `venueSourceCredibility` | 0–15 | venue + source standing |
| `total` | 0–100 | sum of the above four |

Author/institution reputation is **not** a dimension — judge the work, not the affiliation.

---

## Narrative fields (apply STYLE.md to every one)

### `summary` — *required, bilingual*
What it's for: the ~3-sentence overview shown on cards and search.
How to write: about 3 sentences. Must stay consistent with `digest.tldr` (the digest is the
authored source; if they disagree, fix this to match). No hype, define terms on first use.

### `recommendationReason` — *required, bilingual*
What it's for: the 1–2 sentence "why this decision" line.
How to write: 1–2 sentences justifying `recommendationDecision`. Concrete reasons (named result,
actual margin), not adjectives.

### `strengths` — *bilingual list; required (≥1/locale) on SUCCESS, else `null`*
What it's for: the paper's real merits, as a bulleted list.
How to write: 3–5 entries per locale, index-aligned (`en[i]` and `zh-TW[i]` are the same point).
Each entry is one concrete claim — prefer quoted numbers over "substantially improves".

### `weaknesses` — *bilingual list; required (≥1/locale) on SUCCESS, else `null`*
What it's for: limitations, missing evidence, overclaims.
How to write: 2–4 entries per locale, index-aligned. Name the specific gap ("no ablation on X",
"only tested on one dataset"); flag insufficient evidence rather than softening it.

### `tags` — *required (defaults `[]`), single-value list — NOT translated*
What it's for: lowercase English keyword tokens that power the UI "Field" line and search/filter.
How to write: 2–5 tokens like `vision-transformer`, `interpretability`, `diffusion`. English only,
lowercase, hyphenated. Do not translate; do not invent marketing phrases.

### `recommendationDecision` — *required, enum*
What it's for: the keep/store/drop verdict, derived from `scores.total`.
How to write: `"RECOMMEND"` if `total ≥ 65`; `"STORE_ONLY"` if `50 ≤ total < 65`;
`"LOW_QUALITY"` if `total < 50`.

---

## Figure & digest (SUCCESS only)

### `figure` — *nullable; only allowed when `pdfAnalysisStatus = "SUCCESS"`*
What it's for: the one cropped figure shown with the paper. The GUI already cropped it — you only
write the caption.
How to write: when `figures/<safeId>.png` exists, emit
`{ "label", "pageNumber", "caption": { en, "zh-TW" }, "renderedPath" }`. Copy `label`,
`pageNumber`, `renderedPath` from `crop-hints.json`. Write `caption.en` (≤ 240 chars; if quoting
the paper, drop the `"Figure N:"` prefix) and `caption["zh-TW"]` as a faithful translation (≤ 240).
Set `figure = null` when no PNG exists. **Never re-crop and never emit a full-page render.**

### `digest` — *required on SUCCESS, else `null`*
What it's for: the long-form bilingual reader digest (TL;DR → AI commentary).
How to write: fill all six sub-fields per [DIGEST.md](DIGEST.md); each is bilingual Markdown.
`tldr` is a < 100-word popular-science explainer of the paper; `tldr` and `methodOverview` must
contain an analogy or worked example (STYLE.md). Must be `null` whenever
`pdfAnalysisStatus != "SUCCESS"`.

---

## Leave-as-default

### `tableFigureAnalysis` — *single-value*
Legacy slot. Always emit `null` (its default). Do not populate it.

---

## Quick null-rules recap

| `pdfAnalysisStatus` | `strengths` / `weaknesses` | `digest` | `figure` |
|---|---|---|---|
| `SUCCESS` | required (≥1/locale) | required | optional (null if no PNG) |
| `UNAVAILABLE` / `FAILED` | `null` | `null` | `null` |

`summary`, `recommendationReason`, `tags`, `scores`, `recommendationDecision`, `joinKey`,
`evaluationStage` are filled on **every** record, including the PDF-unreadable path.

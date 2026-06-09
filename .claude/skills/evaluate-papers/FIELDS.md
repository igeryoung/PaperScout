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
What it's for: marks that the main-body PDF was read. Gates which narrative fields are required.
How to write: always `"SUCCESS"` in this skill — every bundle paper ships a readable PDF. A
`SUCCESS` record requires `strengths`, `weaknesses`, and `digest`, and allows `figure`. (The
schema also defines `"UNAVAILABLE"` / `"FAILED"` for back-compat, but this skill never emits them.)

### `abstract` — *nullable, single-value — NOT translated*
What it's for: the paper's own abstract. ingest backfills it into `Paper.abstract` (search +
display) **only when the candidate had none** — it never overwrites an existing abstract. The
main beneficiaries are OPENACCESS papers (CVPR/ICCV/ECCV/ACM MM), where collection leaves
`abstract = null`.
How to write: copy the abstract **verbatim** from the PDF — a raw English string, not translated,
not summarized (that's what `summary` is for). If `candidates.json` already carries a non-empty
`abstract`, reuse that exact string. Use `null` only when no abstract exists in either the PDF
or the candidate.

---

## Scores

### `scores` — *required, single-value object*
What it's for: the 4-dimension rubric score and its total; drives `recommendationDecision` and ranking.
How to write: integers only, each within its cap; `total` **must equal** the sum of the four (the
schema rejects a mismatch). The four dimensions, their caps, and the scoring bands are the single
source of truth in **[RUBRIC.md](RUBRIC.md)** — score against its bullets, not on impressions.
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

### `strengths` — *bilingual list; required (≥1/locale)*
What it's for: the paper's real merits, as a bulleted list.
How to write: 2–4 entries per locale, index-aligned (`en[i]` and `zh-TW[i]` are the same point).
Each entry is one concrete claim — prefer quoted numbers over "substantially improves".

### `weaknesses` — *bilingual list; required (≥1/locale)*
What it's for: limitations, missing evidence, overclaims.
How to write: 2–4 entries per locale, index-aligned. Name the specific gap ("no ablation on X",
"only tested on one dataset"); flag insufficient evidence rather than softening it.

### `tags` — *required (defaults `[]`), single-value list — NOT translated*
What it's for: lowercase English keyword tokens that power the UI "Field" line and search/filter.
How to write: 2–5 tokens like `vision-transformer`, `interpretability`, `diffusion`. English only,
lowercase, hyphenated. Do not translate; do not invent marketing phrases.

### `recommendationDecision` — *required, enum*
What it's for: the keep/store/drop verdict, derived from `scores.total`.
How to write: apply the decision thresholds in **[RUBRIC.md](RUBRIC.md)** (single source of truth).

---

## Figure & digest (SUCCESS only)

### `figure` — *nullable; optional*
What it's for: the one cropped figure shown with the paper. The GUI already cropped it — you only
write the caption.
How to write: when `figures/<safeId>.png` exists, emit
`{ "label", "pageNumber", "caption": { en, "zh-TW" }, "renderedPath" }`. Copy `label`,
`pageNumber`, `renderedPath` from `crop-hints.json`. Write `caption.en` (≤ 240 chars; if quoting
the paper, drop the `"Figure N:"` prefix) and `caption["zh-TW"]` as a faithful translation (≤ 240).
Set `figure = null` when no PNG exists. **Never re-crop and never emit a full-page render.**

### `digest` — *required*
What it's for: the long-form bilingual reader digest (TL;DR → AI commentary).
How to write: fill all six sub-fields per [DIGEST.md](DIGEST.md); each is bilingual Markdown.
`tldr` is a < 100-word popular-science explainer of the paper; `tldr` and `methodOverview` must
contain an analogy or worked example (STYLE.md).

---

## Leave-as-default

### `tableFigureAnalysis` — *single-value*
Legacy slot. Always emit `null` (its default). Do not populate it.

---

## Quick required-fields recap

Every record is a `SUCCESS` record (every bundle paper has a readable PDF), so on every record:

- **Required:** `joinKey`, `evaluationStage` (`"FULL_PDF"`), `pdfAnalysisStatus` (`"SUCCESS"`),
  `scores`, `summary`, `recommendationReason`, `tags`, `recommendationDecision`,
  `strengths` (≥1/locale), `weaknesses` (≥1/locale), `digest`.
- **Optional:** `figure` — fill when `figures/<safeId>.png` exists, else `null`.
- **`abstract`:** fill whenever one is recoverable (from the PDF, else the candidate); `null` only
  when neither source has one.
- **`tableFigureAnalysis`:** always `null`.

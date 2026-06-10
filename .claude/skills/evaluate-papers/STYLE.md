# Style & Translation (evaluate-papers)

This file is the source of truth for **how** every bilingual narrative field is written. Loaded from [SKILL.md](SKILL.md).

## Translatable vs. single-value fields

Bilingual `{ en, "zh-TW" }` (or `{ en: [...], "zh-TW": [...] }` for arrays):

- `summary`
- `recommendationReason`
- `strengths` (min 1 entry per locale)
- `weaknesses` (min 1 entry per locale)
- `figure.caption` — **`en` is verbatim from the PDF (≤ 240 chars)**; **`zh-TW` is a faithful translation of that verbatim text (also ≤ 240 chars)**.
- All `digest.*` fields (see [DIGEST.md](DIGEST.md)).

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
- For lists (`strengths`, `weaknesses`): the index order must align — `strengths.en[0]` and `strengths["zh-TW"][0]` describe the same point. List lengths must match (2–4 strengths, 2–4 weaknesses).
- For `figure.caption.zh-TW`: translate the verbatim English caption faithfully. Drop only the bibliographic prefix (e.g. `"Figure 1:"`) — that prefix is already in `figure.label`.

## Audience & Style (applies to every bilingual narrative field)

The default failure mode for this skill is "reviewer talking to another reviewer in the same subfield". Avoid it. The narrative fields exist so a non-specialist reader can actually understand the paper — if they can't, the paper is invisible to them no matter how high it scores.

### Audience

Write for a reader with a **CS / engineering background who is new to this paper's subfield**. They know what a neural network, a loss function, a benchmark, a transformer, gradient descent, and overfitting are. They do **not** know — without a gloss — terms like:

- "residual stream", "logit lens", "disentanglement lemma", "circuit", "ablation" (in the mechanistic-interpretability sense)
- "Koopman operator", "spectral norm", "Jacobian regularization"
- "NeRF densification", "Gaussian splatting", "BRDF"
- "RLHF", "DPO", "reward hacking", "constitutional AI"
- "MoE routing", "speculative decoding", "KV-cache"

If you would have to pause and explain a term to a colleague from a different ML subfield, it needs a gloss.

### Define-on-first-use

The first time a domain-specific term appears **within an evaluation record, per locale**, attach a short plain-English gloss in parentheses. After the first use within that record, the bare term is fine.

- Good: `"applies the disentanglement lemma (a rule that lets you split one tangled computation into a clean sum of cleaner sub-computations, with a small leftover error term) at every layer."`
- Bad: `"applies the disentanglement lemma recursively."`

The gloss must appear in **both** `en` and `zh-TW`, and convey the same plain-English meaning. Do **not** gloss names the existing translation rule already preserves untranslated — model names (`ViT`, `Llama-2-7B`), dataset names (`ImageNet-1k`, `RealToxicityPrompts`), metric names (`PSNR`, `BLEU`) — unless the paper redefines them.

Within `strengths[]` / `weaknesses[]` arrays, treat the array as a single context: define a term in the first bullet that introduces it, not again in later bullets.

### Concrete > abstract

Prefer concrete objects, numbers, and named things over general statements.

- Good: `"Cuts inference latency from 230 ms to 95 ms on a single A100, at the cost of a 0.3-point drop on MMLU."`
- Bad: `"Substantially improves efficiency with a small accuracy trade-off."`

When the paper gives numbers, quote them. When it doesn't, name the actual things being compared rather than describing them in the abstract.

### Analogy requirement (digest only)

`digest.tldr` **must** contain at least one analogy or concrete real-world image. `digest.methodOverview` **must** contain at least one analogy, concrete example, or named worked instance. The analogy must be **aligned across `en` and `zh-TW`** — same image, same point — not two different analogies in two languages.

Analogies should illuminate, not decorate. If the best you can produce is forced or misleading, fall back to a concrete worked example (a specific input and what the method does to it) — that also satisfies the requirement.

### No-marketing

Avoid hype tokens: "groundbreaking", "remarkable", "novel paradigm", "significantly outperforms", "突破性", "顯著超越", "革命性". They sound confident but carry no information. State the actual contribution and the actual margin instead. This reinforces the "Penalize hype" hard constraint in [SKILL.md](SKILL.md).

### Scope (which fields)

These rules apply to **every** bilingual narrative field on every record:

- Top-level: `summary`, `recommendationReason`.
- Lists: every entry of `strengths[]` and `weaknesses[]` (both locales, index-aligned).
- Digest: every `digest.*` field (`tldr`, `problemMotivation`, `keyContributions`, `methodOverview`, `resultsInterpretation`, `aiCommentary`).
- **Excluded:** `figure.caption.en` is verbatim from the PDF (existing rule); `figure.caption["zh-TW"]` is a faithful translation of that verbatim text. Tags and other single-value fields are excluded.

### Before / after examples

Drawn from `data/sample/evaluations.json`. Do **not** copy these verbatim — they are anchors for the tone.

**`digest.methodOverview`**

- Before: `"applies the disentanglement lemma (a jet at a sum of inputs equals a convex combination of jets at each input, up to error) recursively at every block."`
- After: `"applies the disentanglement lemma (a rule that lets you split one tangled computation into a clean sum of cleaner sub-computations, with a small leftover error term) at every block."`

**`digest.tldr`**

- Before: `"Jet Expansions decompose an LLM into explicit input→output polynomial paths plus a remainder, subsuming Logit Lens."`
- After: `"Think of an LLM as a black box you can finally crack open into a labeled list of 'paths' from input to output; this paper provides the crowbar, and it turns out the well-known Logit Lens trick is just one special case of it."`

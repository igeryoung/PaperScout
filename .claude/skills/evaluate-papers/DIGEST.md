# AI Digest (evaluate-papers)

The long-form bilingual digest written for every candidate. Loaded from [SKILL.md](SKILL.md) step c. All field content must follow the [Audience & Style rules](STYLE.md).

## Field shape

When `pdfAnalysisStatus = "SUCCESS"`, fill the `digest` object. Each field is a bilingual `{ en, "zh-TW" }` string containing **Markdown** (not plain text). For numbered or bulleted content, use real Markdown syntax (`1. ...`, `- ...`).

```
digest: {
  tldr:                  { en, "zh-TW" },   // §1 — < 100 words; popular-science explainer of the paper
  problemMotivation:     { en, "zh-TW" },   // §2 — 2–4 sentences
  keyContributions:      { en, "zh-TW" },   // §3 — Markdown numbered list "1. ...\n2. ...\n3. ..."
  methodOverview:        { en, "zh-TW" },   // §4 — 3–6 sentences; explicitly reference the figure (e.g. "(see figure above)")
  resultsInterpretation: { en, "zh-TW" },   // §5 — 2–4 sentences: what the results actually mean; where is the genuine improvement
  aiCommentary:          { en, "zh-TW" },   // §6 — 2–4 sentences of critical analysis (the "AI Commentary" reviewers care about)
}
```

`digest.tldr` and `digest.methodOverview` must contain at least one analogy or concrete worked example — see [STYLE.md](STYLE.md) "Analogy requirement".

## Mapping to existing fields (avoid contradicting yourself)

Only two structured fields now overlap the digest. Keep them consistent:

| Digest section | Existing field |
|---|---|
| `digest.tldr` | `summary` (< 100-word popular-science explainer vs the ~3-sentence overview) |

The top-level `strengths[]` / `weaknesses[]` arrays remain the source of truth for strengths and limitations — there is no longer a digest-side mirror. If you find yourself writing different facts in the digest vs. the structured fields, you have a bug — fix the structured fields to match the digest, since the digest is the authored source.

Both halves of each row must follow the **Audience & Style** rules. The structured fields (`summary`, `recommendationReason`, `strengths`, `weaknesses`) are what most users see in cards and search — they are **not** allowed to be more jargony than the digest. If the digest defines a term inline, the corresponding structured field must also define it (or avoid the term entirely if it has the budget to do so).

## Metadata section of the on-screen digest

The on-screen "## 0. Metadata" block (Title / Authors / Venue / Year / Field / Links) is rendered from existing candidate fields — title, authors, venue, publishedDate, plus `tags[]` for Field, plus `pdfUrl` + `sourceUrl` + `codeUrls[]` for Links. Do NOT duplicate this content into `digest.*`. The digest fields start at §1 TL;DR.

## `digest` is always required

This skill always emits `evaluationStage = "FULL_PDF"` with `pdfAnalysisStatus = "SUCCESS"`
(every bundle paper has a readable PDF), so `digest` is **required and never null**. The zod
schema (`src/server/schema/evaluation.ts`) also permits `digest = null` for the legacy
`UNAVAILABLE` / `FAILED` / `ABSTRACT_SCREENING` cases, but **this skill never emits them**.

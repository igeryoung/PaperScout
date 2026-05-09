# Phase 2.5 — Prompt Harness (offline)

**Goal:** Lock in the Stage-1 (Haiku abstract screening) and Stage-2 (Sonnet full-PDF) prompts against ~5 hand-picked fixture papers, _without_ DB or UI in the loop. Output: schema-valid JSON whose scores agree with intuition.

## Why between Phase 2 and Phase 3

- Phase 2 captured real candidates → we have realistic abstracts to feed.
- Phase 3 wires prompts into the pipeline. If the prompts are wrong, the pipeline fails on real data and debugging conflates LLM quality with infra.
- Iterating in a tight `tsx run-screening.ts` loop is 10x faster than iterating through the whole pipeline.

## Goal checklist

### Fixtures (`scripts/prompt-eval/fixtures/`)

Pick 5 papers spanning the quality spectrum:

- [ ] **F1 — Strong novelty + rigor**: a known landmark CV paper (e.g. SAM, NeRF, DINO). Manual `metadata.json` + downloaded `paper.pdf`.
- [ ] **F2 — Incremental tweak**: a clearly-derivative paper (small architecture change on a benchmark). Should score low on novelty.
- [ ] **F3 — Strong author / weak experiment**: famous lab, small ablations. Tests "don't reward fame alone" (PRD §13 constraint).
- [ ] **F4 — Unknown author / strong method**: solid technical contribution from an unknown group. Tests "reward quality regardless of fame".
- [ ] **F5 — Hype-driven / weak claims**: paper with bold claims, weak benchmarks. Should score low on experimental_quality.
- [ ] Each fixture has `metadata.json` (title / authors / abstract / venue / sourceUrl) + optional `paper.pdf` (skip for F2 if PDF unavailable; harness should handle that)
- [ ] `expected.json` per fixture: rough manually-assigned target scores (e.g. F2: novelty ≤ 8, experimental_quality ≤ 12) — used as soft check, not strict assertion

### LLM client (`src/server/llm/`)

- [ ] `client.ts` —
  - [ ] `screenWithHaiku(input: ScreenInput): Promise<RawLlmJson>`
  - [ ] `analyzeWithSonnet(input: PdfInput): Promise<RawLlmJson>`
  - [ ] Anthropic SDK with retry (exponential backoff, max 3) on 429/5xx
  - [ ] 60s timeout per call
  - [ ] Use `tool_use` or response prefill (`{`) for JSON-only output
  - [ ] Both functions return raw text + token counts; parsing happens in `parse.ts`

- [ ] `pdf.ts` —
  - [ ] `fetchPdfAsDocumentBlock(url): Promise<DocumentBlock | null>`
  - [ ] Downloads PDF (timeout 30s, max 32MB), base64-encodes, returns Anthropic `document` content block
  - [ ] On size > limit or HTTP failure: returns null and logs `pdf_analysis_status='unavailable'` reason

- [ ] `schema.ts` — zod schemas matching PRD §13:
  - [ ] `LlmJudgmentSchema`: paperId, summary, key_contribution, methodology_summary, strengths[], weaknesses[], tags[], scores{ novelty 0-25, methodological_rigor 0-25, experimental_quality 0-20, venue_source_credibility 0-15, author_institution_reputation 0-15, total }, ranking_explanation, recommendation_decision (enum)
  - [ ] Custom refinement: `total === sum of 5 dimensions` (warn, not fail; LLMs miscount sometimes — auto-correct in parse step)

- [ ] `parse.ts` —
  - [ ] `extractJson(raw: string): unknown` — strips code fences, finds first `{...}` block
  - [ ] `parseLlmOutput(raw): { ok: true, data } | { ok: false, error }`
  - [ ] On schema fail: one repair attempt — re-prompt the model with the error message, ask it to fix; cap at 1 retry to avoid token spirals
  - [ ] If `total !== sum`, recompute total from dimensions and emit a warning

### Prompts (`src/server/llm/prompts/`)

- [ ] `versions.ts`:
  ```ts
  export const SCREENING_PROMPT_VERSION = 'screening-v1';
  export const PDF_PROMPT_VERSION = 'pdf-v1';
  ```
- [ ] `abstract-screening.ts`:
  - System prompt: "You are an expert CV reviewer..."
  - Encodes PRD §10 dimension definitions (full text or compressed bullet list per dimension)
  - Encodes PRD §13 constraints (penalize hype, distinguish novelty from scale, mention insufficient evidence)
  - Output format: JSON only, schema in `schema.ts`
  - Few-shot example: 1 strong paper + 1 weak paper with target scores
  - User content: title, authors, abstract, venue, source — formatted block

- [ ] `full-pdf-analysis.ts`:
  - Same dimensions, but prompts the model to **read the PDF document block** and reference tables / figures / ablations explicitly
  - Output format: same schema + `tableFigureAnalysis` field
  - User content: PDF document block + minimal text recap (title, authors, venue)

### Harness scripts

- [ ] `scripts/prompt-eval/run-screening.ts`:
  - Loads each fixture's `metadata.json`
  - Calls `screenWithHaiku`
  - Prints: fixture id → JSON (pretty) + ✅ / ❌ vs `expected.json` soft bounds
  - Exit code 0 if ≥4/5 fixtures pass soft bounds
- [ ] `scripts/prompt-eval/run-pdf.ts`:
  - Loads each fixture's `paper.pdf` (skips if missing)
  - Calls `analyzeWithSonnet`
  - Same output style
- [ ] `npm run prompt:screen` and `npm run prompt:pdf` scripts

### Iteration

- [ ] Run `prompt:screen` → inspect outputs → tweak `abstract-screening.ts` → bump `SCREENING_PROMPT_VERSION` (e.g. `screening-v1.1`) only when prompt changes meaningfully
- [ ] Run `prompt:pdf` → same loop with `full-pdf-analysis.ts`
- [ ] Stop when: schema-valid rate is 5/5, soft bounds pass on ≥4/5, ranking _order_ of fixtures matches intuition (F1 > F4 > F3 > F5 > F2 ish)
- [ ] Save reference outputs at `scripts/prompt-eval/fixtures/expected/{fixtureId}.json` for regression in Phase 3

## Files created in this phase

```
scripts/prompt-eval/fixtures/F1/{metadata.json, paper.pdf?, expected.json}
scripts/prompt-eval/fixtures/F2/...
scripts/prompt-eval/fixtures/F3/...
scripts/prompt-eval/fixtures/F4/...
scripts/prompt-eval/fixtures/F5/...
scripts/prompt-eval/fixtures/expected/F1-screen.json
scripts/prompt-eval/fixtures/expected/F1-pdf.json
... (per fixture, per stage)
scripts/prompt-eval/run-screening.ts
scripts/prompt-eval/run-pdf.ts
src/server/llm/client.ts
src/server/llm/pdf.ts
src/server/llm/schema.ts
src/server/llm/parse.ts
src/server/llm/prompts/abstract-screening.ts
src/server/llm/prompts/full-pdf-analysis.ts
src/server/llm/prompts/versions.ts
tests/unit/llm/parse.test.ts
tests/unit/llm/schema.test.ts
```

## Verification checklist

- [ ] `npm run prompt:screen` exits 0 — all 5 fixtures schema-valid
- [ ] `npm run prompt:pdf` exits 0 — ≥4/5 fixtures schema-valid (PDF may be skipped for one)
- [ ] Output ranking order roughly matches intuition (F1 highest, F2 lowest novelty, F5 lowest experimental_quality)
- [ ] `tests/unit/llm/parse.test.ts` covers: clean JSON, fenced JSON, JSON with prefix prose, malformed JSON → repair, total-sum auto-correct
- [ ] `tests/unit/llm/schema.test.ts` covers: valid object, score out-of-range, missing required field
- [ ] Reference outputs saved under `expected/`
- [ ] `plan/STATE.md` updated to point to Phase 3
- [ ] New entry appended at top of today's `plan/log/YYYY-MM-DD.md`

## Exit criteria

Stage-1 and Stage-2 prompts produce reliably-shaped, intuitively-ranked JSON on the 5-paper fixture set. Reference outputs committed for regression.

## Risks / pitfalls

- **Token spirals on JSON repair** — cap at 1 repair attempt. If still bad, mark evaluation as failed in Phase 3, don't loop.
- **LLM ranks unknown labs uniformly low** — F4 fixture is a regression check for this; if seen, prompt must be tightened with explicit instruction.
- **PDF input limits** — Anthropic's PDF input has size and page caps; document the observed limits in `pdf.ts` JSDoc.
- **Fixtures expire** — landmark papers don't, but venues/citation context might. Refresh fixtures yearly.

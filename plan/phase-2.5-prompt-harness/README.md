# Phase 2.5 — Prompt Harness (offline)

**Goal:** Lock in the Stage-1 abstract screening and Stage-2 full-PDF evaluation prompts against ~5 hand-picked fixture papers, without DB or UI in the loop. Output must conform to the existing `EvaluationRecord` contract and produce scores that agree with reviewer intuition.

## Current-state decision

This phase follows the architecture that exists after Phase 2:

- The app/repo does **not** own Anthropic SDK calls or require `ANTHROPIC_API_KEY`.
- Prompt execution remains skill-driven through `.claude/skills/evaluate-papers/SKILL.md` / `.agents/skills/evaluate-papers/SKILL.md`.
- The canonical output contract is `src/server/schema/evaluation.ts` plus `data/sample/evaluations.json`.
- The harness is a local fixture builder + validator + score-bound checker. It does not write to Postgres and does not introduce a second LLM output schema.

If we later decide Phase 3 should call Anthropic directly from app code, that should be a separate architecture change, not hidden inside this harness phase.

## Why between Phase 2 and Phase 3

- Phase 2 captured real candidates, so we have realistic abstracts and source metadata to feed.
- Phase 3 wires ranking into the pipeline. If prompts are weak, debugging would conflate LLM quality with pipeline/infrastructure behavior.
- Iterating on fixed `candidates.json` fixtures and schema validation is faster than running the whole collection and persistence flow.

## Goal checklist

### Fixtures (`scripts/prompt-eval/fixtures/`)

Pick 5 papers spanning the quality spectrum:

- [x] **F1 — Strong novelty + rigor**: SAM (Kirillov et al. 2023, arXiv:2304.02643). Stage-2 SUCCESS, total=86.
- [x] **F2 — Incremental tweak**: EfficientFormerV2 (Li et al. 2022, arXiv:2212.08059). Stage-2 SUCCESS, total=61, novelty=9.
- [x] **F3 — Strong author / weak experiment**: ViT-22B (Dehghani et al. 2023, arXiv:2302.05442, Google Research). Stage-2 SUCCESS, total=73, novelty=11 (engineering-driven, not algorithmic).
- [x] **F4 — Unknown author / strong method**: SeaThru-NeRF (Levy et al. 2023, arXiv:2304.07743, University of Haifa). Stage-2 SUCCESS, total=71, methodologicalRigor=17, authorInstitutionReputation=8 → confirms unknown-lab anti-suppression.
- [x] **F5 — Hype-driven / weak claims**: The Dawn of LMMs / GPT-4V (Yang et al. 2023, arXiv:2309.17421). PDF 45.6 MB > 32 MB cap → pdfAnalysisStatus=UNAVAILABLE. total=30, experimentalQuality=4 → LOW_QUALITY.
- [x] Each fixture has `metadata.json` that can be transformed into one `CandidateRecord` + a `_fixture` provenance block (`metadataSourceUrl`, `authoredAt`, `frozen: true`).
- [x] Local `paper.pdf` files are **not** committed (decided 2026-05-10 per user choice; gitignored). The skill curls `pdfUrl` to `/tmp/`; F1/F4 bounds widened to `pdfAnalysisStatus in [SUCCESS, UNAVAILABLE]` to tolerate the network dependency.
- [x] Each fixture has `bounds.json` with manually assigned soft checks (F1: novelty≥18 + total≥75; F2: novelty≤12 + total≤65; F3: novelty≤15 + authorInstitutionReputation≥10; F4: methodologicalRigor≥15 + authorInstitutionReputation≤10 + total≥55; F5: experimentalQuality≤12 + decision∈{LOW_QUALITY,STORE_ONLY}).

### Prompt source

- [x] `.claude/skills/evaluate-papers/SKILL.md` is canonical. No edits required during the loop (converged iteration 1).
- [x] `.agents/skills/evaluate-papers/SKILL.md` re-synced byte-for-byte (only diff was the median-affiliation rule).
- [x] Output shape preserved verbatim — `joinKey` / `evaluationStage` / camelCase scores / `recommendationDecision` enum / `pdfAnalysisStatus` enum / optional `tableFigureAnalysis`.
- [x] Prompt continues to reference `src/server/schema/evaluation.ts` and `data/sample/evaluations.json` as the contract.
- [x] All PRD §10 / §13 constraints present in the prompt: hype penalty, novelty-vs-scale, insufficient-evidence framing, no fame reward, median-affiliation rule, PDF tables/figures use.

### Harness scripts

- [x] `scripts/prompt-eval/build-fixture-run.ts` — loads `fixtures/F*/metadata.json`, strips `_fixture`, validates against `CandidatesFileSchema`, writes `runs/<run-id>/candidates.json` + `fixtures-manifest.json`. No PDF-copy step (deferred — skill curls `pdfUrl`).
- [x] `scripts/prompt-eval/check-evaluations.ts` — per-record `EvaluationSchema.safeParse`, joinKey resolution mirroring `scripts/ingest.ts:65-79` (incl. additionalSources), `recomputeTotal` diagnostic, manifest-driven fixture lookup, bounds application, coarse-flag ranking. Exits 0 iff schema-valid all + ≥4/5 bounds-passed + zero unmatched joinKeys.
- [x] `scripts/prompt-eval/normalize-evaluations.ts` — reorders top-level keys deterministically, recomputes `scores.total` only in the normalized copy, writes one file per fixture into `reference/normalized/`.
- [x] `scripts/prompt-eval/lib.ts` (added during execution) — pure helpers (`BoundsSchema`, `FixtureManifestSchema`, `loadFixtures`, `buildCandidateMap`, `resolveJoinKey`, `recomputeTotal`, `applyBounds`, `checkRecordSchema`, `summarize`). All defensive over raw `unknown`. CLIs import from here; tests import from here.
- [x] `npm run prompt:fixtures` (no env-file flag — harness has no DB).
- [x] `npm run prompt:check -- <fixture-run-dir>`.
- [x] `npm run prompt:normalize <fixture-run-dir>`.

### Manual skill loop

This phase intentionally keeps the LLM invocation outside Node scripts:

1. Run `npm run prompt:fixtures`.
2. Invoke `/evaluate-papers` on the generated fixture run dir.
3. Run `npm run validate:evaluations <fixture-run-dir>/evaluations.json`.
4. Run `npm run prompt:check -- <fixture-run-dir>`.
5. Inspect failures and update the skill prompt if needed.
6. Re-run the same fixture set until outputs are schema-valid and rankings are intuitive.

Stop when:

- schema-valid rate is 5/5
- soft bounds pass on at least 4/5
- ranking order roughly matches intuition (`F1 > F4 > F3 > F5 > F2` is the starting expectation, not a hard assertion)
- F2 has low novelty
- F5 has low experimentalQuality
- F4 is not unfairly penalized for unknown authorship

### Regression outputs

- [x] `scripts/prompt-eval/reference/raw/2026-05-10-2142/{candidates,evaluations,fixtures-manifest}.json` — accepted run snapshot.
- [x] `scripts/prompt-eval/reference/normalized/F{1,2,3,4,5}.json` — one normalized snapshot per fixture (5 files).
- [x] Soft target bounds live exclusively in `fixtures/F<n>/bounds.json`; reference outputs contain only observed skill output.

## Files created in this phase

```
scripts/prompt-eval/fixtures/F1/{metadata.json,bounds.json,paper.pdf?}
scripts/prompt-eval/fixtures/F2/{metadata.json,bounds.json,paper.pdf?}
scripts/prompt-eval/fixtures/F3/{metadata.json,bounds.json,paper.pdf?}
scripts/prompt-eval/fixtures/F4/{metadata.json,bounds.json,paper.pdf?}
scripts/prompt-eval/fixtures/F5/{metadata.json,bounds.json,paper.pdf?}
scripts/prompt-eval/runs/.gitkeep
scripts/prompt-eval/reference/raw/.gitkeep
scripts/prompt-eval/reference/normalized/.gitkeep
scripts/prompt-eval/build-fixture-run.ts
scripts/prompt-eval/check-evaluations.ts
scripts/prompt-eval/normalize-evaluations.ts
tests/unit/prompt-eval/bounds.test.ts
tests/unit/prompt-eval/check-evaluations.test.ts
```

Prompt files may be modified in this phase:

```
.claude/skills/evaluate-papers/SKILL.md
.agents/skills/evaluate-papers/SKILL.md
```

Do **not** create these files in this phase unless the architecture decision changes:

```
src/server/llm/client.ts
src/server/llm/pdf.ts
src/server/llm/schema.ts
src/server/llm/prompts/*
```

## Verification checklist

- [x] `npm run prompt:fixtures` exits 0 and writes a valid 5-candidate fixture run.
- [x] `/evaluate-papers` can run against that fixture run and produce `evaluations.json`.
- [x] `npm run validate:evaluations <fixture-run-dir>/evaluations.json` exits 0.
- [x] `npm run prompt:check -- <fixture-run-dir>` exits 0.
- [x] Output ranking order roughly matches intuition (F1 > F3 > F4 > F2 > F5; coarse flags `F1∈top2`, `F5∈bottom2`, `F4≠last` all true).
- [x] F2 novelty (9 ≤ 12) and F5 experimentalQuality (4 ≤ 12) soft checks pass.
- [x] F4 confirms unknown authors are not uniformly suppressed (total=71, third by rank).
- [x] Unit tests cover bounds parsing, joinKey matching, schema failure reporting, soft-bound failure reporting, and total-sum mismatch warnings (33 new tests; 91/91 total green).
- [x] Reference outputs are saved under `scripts/prompt-eval/reference/`.
- [x] `plan/STATE.md` updated to point to Phase 3.
- [x] New entry appended at top of today's `plan/log/2026-05-11.md`.

## Exit criteria

The `evaluate-papers` skill produces reliably shaped, intuitively ranked `EvaluationRecord[]` JSON on the 5-paper fixture set. The accepted output is captured as regression reference data for Phase 3.

## Risks / pitfalls

- **Skill invocation is manual** — this is intentional for the current architecture. The harness validates the output but does not call Anthropic directly.
- **Two skill locations can drift** — if both `.claude/skills/` and `.agents/skills/` remain in use, update both or decide one is canonical before closing the phase.
- **Total-score arithmetic** — `EvaluationSchema` currently fails when `scores.total` is wrong. The checker should report the mismatch clearly and write any corrected form only as a normalized copy.
- **PDF fixture availability** — local `paper.pdf` files make regression stable. URL-only PDFs can disappear or change, so they should be used only to refresh fixtures, not as the default check path.
- **LLM ranks unknown labs uniformly low** — F4 exists to catch this; if seen, tighten the prompt.
- **Fixtures age** — landmark papers do not, but venue/citation context can. Refresh fixtures yearly or when the scoring rubric changes.

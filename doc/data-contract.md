# Sample data — the contract between skills and the ingest script

This directory holds **canonical, hand-crafted examples** of the JSON the two Claude Code skills must produce. They serve three roles:

1. **Schema reference** — the zod schemas at `src/server/schema/{candidate,evaluation}.ts` are authored against these.
2. **Skill prompt example** — both `SKILL.md` files reference these as the target output shape.
3. **Test fixture** — `tests/integration/ingest.test.ts` round-trips these into Postgres.

When the schema or these samples change, *all three roles update together*.

## Files

- `candidates.json` — the output shape of `collect-papers` skill. An array of `CandidateRecord` objects.
- `evaluations.json` — the output shape of `evaluate-papers` skill. An array of `EvaluationRecord` objects, one per candidate (joined via `joinKey`).
- `regression/` (gitignored until Phase 2.5) — captured real skill outputs for fixed query scenarios.

## `CandidateRecord` fields

| Field | Type | Notes |
|---|---|---|
| `title` | string | Original title; ingest also stores a normalized form |
| `authors` | string[] | List of author names, in author-order |
| `abstract` | string \| null | Full abstract text; null only when the source genuinely lacks one |
| `venue` | string \| null | Conference / journal / workshop, e.g. `"CVPR 2026"`; null for arXiv-only preprints |
| `publishedDate` | string (ISO-8601 date) | `YYYY-MM-DD` |
| `sourceUrl` | string | URL of the source page (arxiv.org/abs/…, openreview.net/forum?id=…, huggingface.co/papers/…) |
| `pdfUrl` | string \| null | Direct PDF URL; null if not derivable |
| `sourcePaperId` | string \| null | arXiv id, OpenReview forum id, or HF slug; null only if truly absent |
| `source` | enum `ARXIV` \| `OPENREVIEW` \| `HUGGINGFACE` | Primary source for this record |
| `codeUrls` | string[] | GitHub / Papers-With-Code / HF Space links, extracted by the skill |
| `additionalSources` | array | Cross-source dedup hint: if this paper appears on arXiv AND HF, list the *other* sources here so ingest creates the linking `paper_sources` rows |

`additionalSources[i]` shape: `{ source, sourceUrl, sourcePaperId }`.

## `EvaluationRecord` fields

| Field | Type | Notes |
|---|---|---|
| `joinKey` | `{ source, sourcePaperId }` | Identifies which candidate this evaluation is for. Must match exactly one candidate. |
| `evaluationStage` | enum `ABSTRACT_SCREENING` \| `FULL_PDF` | Stage-1 = abstract-only; Stage-2 = full PDF read |
| `scores.novelty` | int 0-25 | PRD §10 |
| `scores.methodologicalRigor` | int 0-25 | PRD §10 |
| `scores.experimentalQuality` | int 0-20 | PRD §10 |
| `scores.venueSourceCredibility` | int 0-15 | PRD §10 |
| `scores.authorInstitutionReputation` | int 0-15 | PRD §10 |
| `scores.total` | int 0-100 | Must equal sum of the 5 dimensions |
| `summary` | string | 1-3 sentence summary |
| `recommendationReason` | string | Why this paper would (or would not) be recommended; visible on the top-10 card |
| `keyContribution` | string \| null | Only populated when `evaluationStage === FULL_PDF` |
| `methodologySummary` | string \| null | Same |
| `strengths` | string[] \| null | Same |
| `weaknesses` | string[] \| null | Same |
| `tags` | string[] | Free-form, lowercase, normalized; ingest may dedup against `paper_tags` |
| `rankingExplanation` | string | Longer-form rationale visible on the detail page |
| `recommendationDecision` | enum `RECOMMEND` \| `STORE_ONLY` \| `LOW_QUALITY` | Drives downstream filtering hints; NOT the same as `is_recommended` (top-10 selection happens in ingest) |
| `pdfAnalysisStatus` | enum `SUCCESS` \| `FAILED` \| `UNAVAILABLE` \| null | Only populated when stage = FULL_PDF; null for abstract-only |
| `tableFigureAnalysis` | unknown \| null | Optional structured evidence from PDF tables/figures |

## Stage-1 vs Stage-2

The `evaluate-papers` skill:

- Always emits one `EvaluationRecord` per candidate (30 entries for a real run).
- For top-15 by Stage-1 `total`, downloads the PDF (`Bash curl --max-filesize 32M`) and re-evaluates with `evaluationStage = FULL_PDF`. The re-evaluation OVERWRITES the Stage-1 record in the JSON output (so the array stays at 30 entries, but 15 of them are Stage-2 results).
- If PDF download fails or oversize: keep Stage-1 scores; set `pdfAnalysisStatus = FAILED` or `UNAVAILABLE`; leave `keyContribution`/`methodologySummary`/`strengths`/`weaknesses` as null.

## Why `total` is stored *and* derivable

The skill is asked to compute it; the ingest script *recomputes* and uses the recomputed value as authoritative (LLMs occasionally miscount). Storing the LLM's reported total lets us audit when this happens.

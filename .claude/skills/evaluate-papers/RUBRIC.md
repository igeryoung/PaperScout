# Scoring Rubric (evaluate-papers)

Four dimensions sum to a 0–100 `total`. Loaded from [SKILL.md](SKILL.md) step d.

| Dimension | Max |
|---|---|
| novelty | 25 |
| methodologicalRigor | 30 |
| experimentalQuality | 30 |
| venueSourceCredibility | 15 |
| **total** | **100** (sum of the 4; the schema enforces this) |

Score on the listed criteria, not on impressions. Each dimension has an explicit **reward** list and **penalize** list — count up what's present, subtract what's missing. The score for a dimension should be defensible by pointing at specific items in these lists.

## 1. novelty (0–25)

**Reward:**

- A new framing or formulation that re-explains existing tools as a special case.
- An empirical observation no prior paper has reported, that this paper is the first to actually demonstrate.
- A method that exposes a new capability — not a smaller / faster / more accurate version of an existing one.
- Cross-domain transfer: importing a technique from one subfield into another where it changes the problem.

**Penalize:**

- "X + transformer" or "X + diffusion" framings that don't change what the method can do.
- Incremental architecture tweaks with no theoretical or empirical surprise.
- Repackaging a known result with new terminology.
- Engineering-only scale (bigger model, more data) presented as novelty — score that on `experimentalQuality`, not here.

## 2. methodologicalRigor (0–30)

**Reward:**

- Theorems / lemmas with clear statements and proofs (appendix proofs count).
- Assumptions clearly identified, including where they fail.
- Method description detailed enough that a competent ML engineer could re-implement from the paper.
- Acknowledgment of failure modes / cases where the approach doesn't work.

**Penalize:**

- Hand-wavy derivations or "it can be shown" without showing.
- Missing definitions (e.g. defines a loss but not the search space).
- Hidden assumptions: claims that only hold under restrictive conditions the paper doesn't state.
- Inconsistencies between the paper's stated method and what the pseudocode / released code actually does.

## 3. experimentalQuality (0–30)

**Reward:**

- Multiple datasets / domains that test the same claim.
- Strong baselines, including recent SOTA **and** obvious-but-strong simple methods.
- Ablations that isolate each design choice and show which one drives the gain.
- Error bars, multiple seeds, or confidence intervals on headline numbers.
- Negative results reported alongside positive ones.

**Penalize:**

- Single-dataset / single-domain validation.
- Weak, outdated, or cherry-picked baselines.
- Missing ablations: the design has multiple knobs but only one combination is shown.
- No variance reporting on headline numbers.
- "Improvements" within benchmark noise (e.g. sub-0.5 point gains on noisy benchmarks reported as wins).

## 4. venueSourceCredibility (0–15)

**Reward:**

- Top-tier accepted venues: NeurIPS / ICML / ICLR main track, AAAI, top journals.
- Spotlight / oral / honorable mention designations.
- Recent arXiv preprints from authors with a consistent track record in the area.

**Penalize:**

- Workshop / poster-only at lower-tier venues without other credibility signals.
- Repackaged tutorials or surveys presented as research.
- arXiv-only with no peer review **and** no other strong signals.

## Decision thresholds

After summing the 4 dimensions:

- `total ≥ 65` → `recommendationDecision = "RECOMMEND"`
- `50 ≤ total < 65` → `recommendationDecision = "STORE_ONLY"`
- `total < 50` → `recommendationDecision = "LOW_QUALITY"`

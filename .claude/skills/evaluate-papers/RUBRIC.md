# Scoring Rubric (evaluate-papers)

Four dimensions sum to a 0–100 `total`. Loaded from [SKILL.md](SKILL.md) step d.

| Dimension | Max |
|---|---|
| novelty | 25 |
| methodologicalRigor | 30 |
| experimentalQuality | 30 |
| venueSourceCredibility | 15 |
| **total** | **100** (sum of the 4; the schema enforces this) |

Score each dimension by **matching the paper to a band**, not by impressions. Each dimension
below is split into 5 bands from worst to best; read top to bottom, find the highest band the
paper fully clears, and take a score from inside that band's range. The score for a dimension
should be defensible by naming the band and the signals that put it there.

**Band convention:** ranges are inclusive integers and do **not** overlap — every score lands
in exactly one band (e.g. for novelty, `5` is in the `0–5` band and `6` is in the `6–10` band).
Use the lower end of a band when the paper barely clears it and the upper end when it nearly
reaches the next band up.

## 1. novelty (0–25)

| Band | Standard |
|---|---|
| **21–25** | Paradigm-level. A new framing or formulation that re-explains existing tools as a special case, or a method that exposes a capability not previously possible. Cross-domain transfer that changes the problem itself. |
| **16–20** | Genuinely new. The first paper to actually demonstrate an empirical observation no prior work reported, or a method that does more than a smaller / faster / more-accurate version of an existing one. Clear conceptual contribution within an established line. |
| **11–15** | Moderate. A meaningful new combination or extension that changes some behavior, but stays inside an established paradigm. |
| **6–10** | Incremental. Architecture tweaks, or "X + transformer" / "X + diffusion" framings, that don't change what the method can do. No theoretical or empirical surprise. |
| **0–5** | None. Repackaging a known result with new terminology, or engineering-only scale (bigger model, more data) presented as novelty — score scale on `experimentalQuality`, not here. |

## 2. methodologicalRigor (0–30)

| Band | Standard |
|---|---|
| **25–30** | Rigorous. Theorems / lemmas with clear statements and proofs (appendix proofs count); assumptions explicitly identified, including where they fail; method detailed enough for a competent ML engineer to re-implement from the paper; failure modes acknowledged. |
| **19–24** | Mostly rigorous. Solid derivations and definitions with only minor gaps; assumptions mostly stated; reproducible with some effort. |
| **13–18** | Adequate but uneven. Method is described, but some definitions are missing (e.g. defines a loss but not the search space) or assumptions are left implicit; little discussion of where the approach fails. |
| **7–12** | Weak. Hand-wavy derivations or "it can be shown" without showing; key definitions absent; hidden assumptions that only hold under restrictive conditions the paper doesn't state. |
| **0–6** | Unsound. No clear method, or inconsistencies between the stated method and what the pseudocode / released code actually does; central claims unsupported. |

## 3. experimentalQuality (0–30)

| Band | Standard |
|---|---|
| **25–30** | Thorough. Multiple datasets / domains test the same claim; strong baselines including recent SOTA **and** obvious-but-strong simple methods; ablations that isolate each design choice; error bars / multiple seeds / confidence intervals on headline numbers; negative results reported alongside positive ones. |
| **19–24** | Strong. Several solid baselines and ablations with variance reporting on headline numbers, but some gaps (e.g. limited domains, or a few design knobs left unablated). |
| **13–18** | Adequate. Reasonable baselines, but missing some ablations or variance reporting, and validation is mostly single-domain. |
| **7–12** | Weak. Single-dataset / single-domain validation; weak, outdated, or cherry-picked baselines; the design has multiple knobs but only one combination is shown; no variance on headline numbers. |
| **0–6** | Inadequate. No meaningful comparison, or "improvements" within benchmark noise (e.g. sub-0.5 point gains on noisy benchmarks) reported as wins. |

## 4. venueSourceCredibility (0–15)

| Band | Standard |
|---|---|
| **13–15** | Top-tier accepted venue (NeurIPS / ICML / ICLR main track, AAAI, top journals) **with** a spotlight / oral / honorable mention designation. |
| **10–12** | Top-tier accepted main-track / poster without a special designation. |
| **7–9** | Reputable but mid-tier accepted venue, or a recent arXiv preprint from authors with a consistent track record in the area. |
| **4–6** | Workshop / poster-only at a lower-tier venue, but with some other credibility signal. |
| **0–3** | arXiv-only with no peer review **and** no other strong signal, or a repackaged tutorial / survey presented as research. |

## Decision thresholds

After summing the 4 dimensions:

- `total ≥ 65` → `recommendationDecision = "RECOMMEND"`
- `50 ≤ total < 65` → `recommendationDecision = "STORE_ONLY"`
- `total < 50` → `recommendationDecision = "LOW_QUALITY"`

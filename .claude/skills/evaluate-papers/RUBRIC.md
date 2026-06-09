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
| **21–25** | Strongly novel. A new problem formulation, a capability not previously demonstrated, the first paper to show a particular effect/result, or a re-framing that re-explains existing tools as a special case. A new combination also lands here when it clearly changes *what is achievable*, not just the metric. |
| **16–20** | Clearly novel within an established line. A specific, identifiable new idea — a new mechanism, architecture, objective, or training/inference strategy that does more than a smaller / faster / more-accurate variant of prior work. This is the normal band for a solid, well-motivated method paper at a top venue. |
| **11–15** | Moderate. A sensible new combination or extension that yields a real but largely expected improvement inside an established paradigm. |
| **6–10** | Incremental. Minor tweaks, or "X + transformer" / "X + diffusion" framings, that don't change what the method can do. No conceptual or empirical surprise. |
| **0–5** | None. Repackaging a known result with new terminology, or engineering-only scale (bigger model, more data) presented as novelty — score scale on `experimentalQuality`, not here. |

## 2. methodologicalRigor (0–30)

| Band | Standard |
|---|---|
| **25–30** | Rigorous. The method is specified precisely enough for a competent ML engineer to re-implement from the paper; design choices are justified; assumptions, limitations, and failure modes are stated. Correctness is supported **either** by theory (theorems / lemmas with clear statements and proofs — appendix proofs count) **or** by a careful, well-controlled empirical protocol. **Theory is not required** — a fully-specified, reproducible empirical method with honest limitations clears this band. |
| **19–24** | Mostly rigorous. Method is clear and largely reproducible with only minor gaps; most design choices justified; limitations touched on but not thoroughly. |
| **13–18** | Adequate but uneven. Method is described, but some definitions/details are missing (e.g. defines a loss but not the search space) or assumptions are left implicit; little discussion of where the approach fails. |
| **7–12** | Weak. Hand-wavy derivations or "it can be shown" without showing; key definitions absent; hard to reproduce from the paper; hidden assumptions that only hold under restrictive conditions the paper doesn't state. |
| **0–6** | Unsound. No clear method, or inconsistencies between the stated method and what the pseudocode / released code actually does; central claims unsupported. |

## 3. experimentalQuality (0–30)

| Band | Standard |
|---|---|
| **25–30** | Thorough. Multiple datasets / domains test the same claim; strong baselines including recent SOTA **and** obvious-but-strong simple methods; ablations that isolate each design choice. Variance reporting (error bars / multiple seeds / CIs) and reported negative results **strengthen** the case and place a paper at the top of this band, but their **absence does not by itself bar this band** when dataset coverage, baselines, and ablations are otherwise comprehensive. |
| **19–24** | Strong. Several solid baselines and ablations, but with gaps — e.g. limited domains, a few design knobs left unablated, or no variance reporting on headline numbers. |
| **13–18** | Adequate. Reasonable baselines, but missing some key ablations, and validation is mostly single-domain. |
| **7–12** | Weak. Single-dataset / single-domain validation; weak, outdated, or cherry-picked baselines; the design has multiple knobs but only one combination is shown. |
| **0–6** | Inadequate. No meaningful comparison, or "improvements" within benchmark noise (e.g. sub-0.5 point gains on noisy benchmarks) reported as wins. |

## 4. venueSourceCredibility (0–15)

| Band | Standard |
|---|---|
| **13–15** | Top-tier accepted venue (NeurIPS / ICML / ICLR main track, CVPR / ICCV / ECCV, AAAI, top journals). Use **13** for a regular accepted poster / main-track paper, **14–15** when it carries a spotlight / oral / honorable-mention designation. |
| **10–12** | Reputable mid-tier accepted venue (e.g. WACV / ACCV / ACM MM / strong domain conferences), or a workshop at a top-tier venue. |
| **7–9** | Lower-tier accepted venue, or a recent arXiv preprint from authors with a consistent track record in the area. |
| **4–6** | Workshop / poster-only at a lower-tier venue, but with some other credibility signal. |
| **0–3** | arXiv-only with no peer review **and** no other strong signal, or a repackaged tutorial / survey presented as research. |

## Decision thresholds

After summing the 4 dimensions:

- `total ≥ 80` → `recommendationDecision = "RECOMMEND"`
- `60 ≤ total < 80` → `recommendationDecision = "STORE_ONLY"`
- `total < 60` → `recommendationDecision = "LOW_QUALITY"`

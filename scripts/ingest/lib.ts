// Pure ranking helpers for scripts/ingest.ts.
// No DB, no IO — safe to unit-test in isolation.

import type { Evaluation } from '@/server/schema/evaluation';

export interface PaperEval {
  paperId: string;
  candidateOrder: number;
  joinKey: string;
  evaluations: Evaluation[];
}

export function recomputeTotal(scores: Evaluation['scores']): number {
  return (
    scores.novelty +
    scores.methodologicalRigor +
    scores.experimentalQuality +
    scores.venueSourceCredibility +
    scores.authorInstitutionReputation
  );
}

export interface RankedScore {
  paperId: string;
  candidateOrder: number;
  score: number;
  recommendationDecision: Evaluation['recommendationDecision'];
  sourceEval: Evaluation;
}

const DECISION_PRIORITY: Record<Evaluation['recommendationDecision'], number> = {
  RECOMMEND: 0,
  STORE_ONLY: 1,
  LOW_QUALITY: 2,
};

// Phase 3 score-selection rules:
//  - FULL_PDF SUCCESS  beats ABSTRACT_SCREENING.
//  - FULL_PDF FAILED / UNAVAILABLE falls back to ABSTRACT_SCREENING when present.
//  - FULL_PDF UNAVAILABLE alone (F5 path): return its Stage-1-preserved scores.
//  - ABSTRACT_SCREENING alone: return it.
//  - No evaluations: return null (caller fails fast).
export function chooseRankingScore(p: PaperEval): RankedScore | null {
  const fullPdf = p.evaluations.find((e) => e.evaluationStage === 'FULL_PDF');
  const abstract = p.evaluations.find((e) => e.evaluationStage === 'ABSTRACT_SCREENING');

  const pick = (e: Evaluation): RankedScore => ({
    paperId: p.paperId,
    candidateOrder: p.candidateOrder,
    score: recomputeTotal(e.scores),
    recommendationDecision: e.recommendationDecision,
    sourceEval: e,
  });

  if (fullPdf && fullPdf.pdfAnalysisStatus === 'SUCCESS') return pick(fullPdf);
  if (abstract) return pick(abstract);
  if (fullPdf) return pick(fullPdf);
  return null;
}

export interface Ranked extends RankedScore {
  rank: number;
  isRecommended: boolean;
}

// Tie-breakers, in order:
//  1. score desc
//  2. recommendation decision priority (RECOMMEND > STORE_ONLY > LOW_QUALITY)
//  3. candidateOrder asc (preserves candidates.json order)
//  4. paperId asc (deterministic final fallback)
export function rankPapers(scored: RankedScore[]): Ranked[] {
  const sorted = [...scored].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const dp = DECISION_PRIORITY[a.recommendationDecision] - DECISION_PRIORITY[b.recommendationDecision];
    if (dp !== 0) return dp;
    if (a.candidateOrder !== b.candidateOrder) return a.candidateOrder - b.candidateOrder;
    return a.paperId.localeCompare(b.paperId);
  });

  const total = sorted.length;
  const recommendedCutoff = Math.min(10, total);
  // is_recommended combines the top-N cap with the skill's RECOMMEND decision.
  // A paper in the top N but flagged STORE_ONLY / LOW_QUALITY is NOT recommended.
  return sorted.map((s, i) => ({
    ...s,
    rank: i + 1,
    isRecommended: i + 1 <= recommendedCutoff && s.recommendationDecision === 'RECOMMEND',
  }));
}

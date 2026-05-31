// DB-row analogue of scripts/ingest/lib.ts:chooseRankingScore.
// Picks which PaperEvaluation row to display for a paper given multiple stages.
// Priority:
//   1. FULL_PDF with pdfAnalysisStatus = SUCCESS
//   2. ABSTRACT_SCREENING (when FULL_PDF is FAILED/UNAVAILABLE)
//   3. FULL_PDF (any status) when ABSTRACT_SCREENING absent
//   4. null when there are no evaluations

import type { EvaluationStage, PdfAnalysisStatus } from '@prisma/client';

type EvaluationLike = {
  evaluationStage: EvaluationStage;
  pdfAnalysisStatus: PdfAnalysisStatus | null;
};

export function selectBestEvaluation<T extends EvaluationLike>(
  evals: readonly T[],
): T | null {
  if (evals.length === 0) return null;
  const fullPdf = evals.find((e) => e.evaluationStage === 'FULL_PDF');
  const abstract = evals.find((e) => e.evaluationStage === 'ABSTRACT_SCREENING');
  if (fullPdf && fullPdf.pdfAnalysisStatus === 'SUCCESS') return fullPdf;
  if (abstract) return abstract;
  if (fullPdf) return fullPdf;
  return null;
}

export type ScoreTier = 'good' | 'mid' | 'weak';

// Restrained good/mid/weak thresholds for ScoreBreakdown bars. Generic over
// (score, max) so it works for both totals and individual dimensions.
export function scoreTier(score: number, max: number): ScoreTier {
  if (max <= 0) return 'weak';
  const ratio = score / max;
  if (ratio >= 0.7) return 'good';
  if (ratio >= 0.5) return 'mid';
  return 'weak';
}

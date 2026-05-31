import { describe, expect, it } from 'vitest';
import type { PaperEvaluation } from '@prisma/client';

import { selectBestEvaluation, scoreTier } from '@/server/lib/select-evaluation';

function evalRow(overrides: Partial<PaperEvaluation>): PaperEvaluation {
  return {
    id: 'eval-id',
    paperId: 'paper-id',
    runId: 'run-id',
    evaluationStage: 'ABSTRACT_SCREENING',
    llmModel: 'claude-sonnet-4-6',
    llmPromptVersion: 'evaluate-papers:abc',
    summary: 's',
    keyContribution: null,
    methodologySummary: null,
    strengths: null,
    weaknesses: null,
    noveltyScore: 10,
    methodologicalRigorScore: 10,
    experimentalQualityScore: 10,
    venueSourceCredibilityScore: 10,
    authorInstitutionReputationScore: 10,
    totalScore: 50,
    rankingExplanation: 'e',
    recommendationReason: 'r',
    recommendationDecision: 'STORE_ONLY',
    pdfAnalysisStatus: null,
    tableFigureAnalysis: null,
    digest: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('selectBestEvaluation', () => {
  it('returns null when no evaluations', () => {
    expect(selectBestEvaluation([])).toBeNull();
  });

  it('returns ABSTRACT_SCREENING when it is the only evaluation', () => {
    const abstract = evalRow({ evaluationStage: 'ABSTRACT_SCREENING' });
    expect(selectBestEvaluation([abstract])?.id).toBe(abstract.id);
  });

  it('prefers FULL_PDF SUCCESS over ABSTRACT_SCREENING', () => {
    const abstract = evalRow({ id: 'abs', evaluationStage: 'ABSTRACT_SCREENING' });
    const full = evalRow({
      id: 'full',
      evaluationStage: 'FULL_PDF',
      pdfAnalysisStatus: 'SUCCESS',
    });
    expect(selectBestEvaluation([abstract, full])?.id).toBe('full');
    expect(selectBestEvaluation([full, abstract])?.id).toBe('full');
  });

  it('falls back to ABSTRACT_SCREENING when FULL_PDF is FAILED', () => {
    const abstract = evalRow({ id: 'abs', evaluationStage: 'ABSTRACT_SCREENING' });
    const full = evalRow({
      id: 'full',
      evaluationStage: 'FULL_PDF',
      pdfAnalysisStatus: 'FAILED',
    });
    expect(selectBestEvaluation([abstract, full])?.id).toBe('abs');
  });

  it('falls back to ABSTRACT_SCREENING when FULL_PDF is UNAVAILABLE', () => {
    const abstract = evalRow({ id: 'abs', evaluationStage: 'ABSTRACT_SCREENING' });
    const full = evalRow({
      id: 'full',
      evaluationStage: 'FULL_PDF',
      pdfAnalysisStatus: 'UNAVAILABLE',
    });
    expect(selectBestEvaluation([abstract, full])?.id).toBe('abs');
  });

  it('returns FULL_PDF UNAVAILABLE alone (F5 path)', () => {
    const full = evalRow({
      id: 'full',
      evaluationStage: 'FULL_PDF',
      pdfAnalysisStatus: 'UNAVAILABLE',
    });
    expect(selectBestEvaluation([full])?.id).toBe('full');
  });
});

describe('scoreTier', () => {
  it('returns good at >= 70%', () => {
    expect(scoreTier(70, 100)).toBe('good');
    expect(scoreTier(100, 100)).toBe('good');
    expect(scoreTier(18, 25)).toBe('good');
  });

  it('returns mid between 50% and 70%', () => {
    expect(scoreTier(50, 100)).toBe('mid');
    expect(scoreTier(69, 100)).toBe('mid');
    expect(scoreTier(13, 25)).toBe('mid');
  });

  it('returns weak below 50%', () => {
    expect(scoreTier(49, 100)).toBe('weak');
    expect(scoreTier(0, 100)).toBe('weak');
    expect(scoreTier(7, 20)).toBe('weak');
  });

  it('returns weak when max <= 0', () => {
    expect(scoreTier(5, 0)).toBe('weak');
  });
});

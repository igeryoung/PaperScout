import { describe, expect, it } from 'vitest';
import {
  chooseRankingScore,
  rankPapers,
  recomputeTotal,
  type PaperEval,
  type RankedScore,
} from '@/../scripts/ingest/lib';
import type { Evaluation } from '@/server/schema/evaluation';

function mkScores(over: Partial<Evaluation['scores']> = {}): Evaluation['scores'] {
  const base = {
    novelty: 10,
    methodologicalRigor: 10,
    experimentalQuality: 10,
    venueSourceCredibility: 10,
    authorInstitutionReputation: 10,
  };
  const merged = { ...base, ...over };
  return {
    ...merged,
    total:
      merged.novelty +
      merged.methodologicalRigor +
      merged.experimentalQuality +
      merged.venueSourceCredibility +
      merged.authorInstitutionReputation,
  };
}

const L = (en: string) => ({ en, 'zh-TW': en });
const LL = (en: string[]) => ({ en, 'zh-TW': en });

function mkEval(over: Partial<Evaluation> = {}): Evaluation {
  return {
    joinKey: { source: 'ARXIV', sourcePaperId: '0000.0000' },
    evaluationStage: 'ABSTRACT_SCREENING',
    scores: mkScores(),
    summary: L('summary'),
    recommendationReason: L('reason'),
    keyContribution: null,
    methodologySummary: null,
    strengths: null,
    weaknesses: null,
    tags: [],
    rankingExplanation: L('expl'),
    recommendationDecision: 'STORE_ONLY',
    pdfAnalysisStatus: null,
    tableFigureAnalysis: null,
    ...over,
  } as Evaluation;
}

function mkPaperEval(paperId: string, evals: Evaluation[], candidateOrder = 0): PaperEval {
  return { paperId, candidateOrder, joinKey: `ARXIV:${paperId}`, evaluations: evals };
}

describe('recomputeTotal', () => {
  it('returns the dimension sum ignoring scores.total', () => {
    const scores = { ...mkScores({ novelty: 5 }), total: 999 };
    expect(recomputeTotal(scores)).toBe(45);
  });

  it('handles zero scores', () => {
    expect(recomputeTotal(mkScores({ novelty: 0, methodologicalRigor: 0, experimentalQuality: 0, venueSourceCredibility: 0, authorInstitutionReputation: 0 }))).toBe(0);
  });
});

describe('chooseRankingScore', () => {
  it('returns null when there are no evaluations', () => {
    expect(chooseRankingScore(mkPaperEval('p1', []))).toBeNull();
  });

  it('FULL_PDF SUCCESS beats ABSTRACT_SCREENING', () => {
    const abstract = mkEval({ evaluationStage: 'ABSTRACT_SCREENING', scores: mkScores({ novelty: 5 }) });
    const full = mkEval({
      evaluationStage: 'FULL_PDF',
      scores: mkScores({ novelty: 20 }),
      pdfAnalysisStatus: 'SUCCESS',
      keyContribution: L('kc'),
      methodologySummary: L('ms'),
      strengths: LL(['s']),
      weaknesses: LL(['w']),
    });
    const got = chooseRankingScore(mkPaperEval('p1', [abstract, full]));
    expect(got?.sourceEval).toBe(full);
    expect(got?.score).toBe(60); // 20 + 10*4
  });

  it('FULL_PDF FAILED falls back to ABSTRACT_SCREENING when present', () => {
    const abstract = mkEval({ evaluationStage: 'ABSTRACT_SCREENING', scores: mkScores({ novelty: 5 }) });
    const full = mkEval({
      evaluationStage: 'FULL_PDF',
      scores: mkScores({ novelty: 20 }),
      pdfAnalysisStatus: 'FAILED',
    });
    const got = chooseRankingScore(mkPaperEval('p1', [abstract, full]));
    expect(got?.sourceEval).toBe(abstract);
    expect(got?.score).toBe(45);
  });

  it('FULL_PDF UNAVAILABLE alone returns its Stage-1-preserved score (F5 path)', () => {
    const full = mkEval({
      evaluationStage: 'FULL_PDF',
      scores: mkScores({ novelty: 5, methodologicalRigor: 6, experimentalQuality: 4, venueSourceCredibility: 4, authorInstitutionReputation: 11 }),
      pdfAnalysisStatus: 'UNAVAILABLE',
      recommendationDecision: 'LOW_QUALITY',
    });
    const got = chooseRankingScore(mkPaperEval('p1', [full]));
    expect(got?.sourceEval).toBe(full);
    expect(got?.score).toBe(30);
    expect(got?.recommendationDecision).toBe('LOW_QUALITY');
  });

  it('ABSTRACT_SCREENING alone wins by default', () => {
    const abstract = mkEval({ scores: mkScores({ novelty: 8 }) });
    const got = chooseRankingScore(mkPaperEval('p1', [abstract]));
    expect(got?.sourceEval).toBe(abstract);
    expect(got?.score).toBe(48);
  });

  it('FULL_PDF FAILED alone returns its score (no abstract fallback available)', () => {
    const full = mkEval({
      evaluationStage: 'FULL_PDF',
      scores: mkScores({ novelty: 3 }),
      pdfAnalysisStatus: 'FAILED',
    });
    const got = chooseRankingScore(mkPaperEval('p1', [full]));
    expect(got?.sourceEval).toBe(full);
    expect(got?.score).toBe(43);
  });
});

function score(over: Partial<RankedScore>): RankedScore {
  return {
    paperId: 'p',
    candidateOrder: 0,
    score: 50,
    recommendationDecision: 'STORE_ONLY',
    sourceEval: mkEval(),
    ...over,
  };
}

describe('rankPapers', () => {
  it('produces dense ranks 1..N', () => {
    const ranked = rankPapers([
      score({ paperId: 'a', score: 90 }),
      score({ paperId: 'b', score: 80 }),
      score({ paperId: 'c', score: 70 }),
    ]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked.map((r) => r.paperId)).toEqual(['a', 'b', 'c']);
  });

  it('marks at most min(10, n) recommended, restricted to RECOMMEND decisions', () => {
    // All RECOMMEND: cap binds.
    const fiveRec = Array.from({ length: 5 }, (_, i) =>
      score({ paperId: `p${i}`, score: 100 - i, recommendationDecision: 'RECOMMEND' }),
    );
    expect(rankPapers(fiveRec).filter((r) => r.isRecommended).length).toBe(5);

    const twelveRec = Array.from({ length: 12 }, (_, i) =>
      score({ paperId: `p${String(i).padStart(2, '0')}`, score: 100 - i, recommendationDecision: 'RECOMMEND' }),
    );
    expect(rankPapers(twelveRec).filter((r) => r.isRecommended).length).toBe(10);

    // Mixed: only RECOMMEND rows within the top-N flag.
    const mixed = [
      score({ paperId: 'a', score: 90, recommendationDecision: 'RECOMMEND' }),
      score({ paperId: 'b', score: 80, recommendationDecision: 'STORE_ONLY' }),
      score({ paperId: 'c', score: 70, recommendationDecision: 'LOW_QUALITY' }),
      score({ paperId: 'd', score: 60, recommendationDecision: 'RECOMMEND' }),
    ];
    const ranked = rankPapers(mixed);
    expect(ranked.filter((r) => r.isRecommended).map((r) => r.paperId)).toEqual(['a', 'd']);
  });

  it('tie-breaks by decision priority before candidateOrder', () => {
    const ranked = rankPapers([
      score({ paperId: 'low', score: 70, recommendationDecision: 'LOW_QUALITY', candidateOrder: 0 }),
      score({ paperId: 'rec', score: 70, recommendationDecision: 'RECOMMEND', candidateOrder: 1 }),
      score({ paperId: 'store', score: 70, recommendationDecision: 'STORE_ONLY', candidateOrder: 2 }),
    ]);
    expect(ranked.map((r) => r.paperId)).toEqual(['rec', 'store', 'low']);
  });

  it('falls back to candidateOrder when score + decision tie', () => {
    const ranked = rankPapers([
      score({ paperId: 'second', score: 70, recommendationDecision: 'RECOMMEND', candidateOrder: 5 }),
      score({ paperId: 'first', score: 70, recommendationDecision: 'RECOMMEND', candidateOrder: 2 }),
    ]);
    expect(ranked.map((r) => r.paperId)).toEqual(['first', 'second']);
  });

  it('falls back to paperId when score + decision + candidateOrder all tie', () => {
    const ranked = rankPapers([
      score({ paperId: 'zeta', score: 70, recommendationDecision: 'RECOMMEND', candidateOrder: 0 }),
      score({ paperId: 'alpha', score: 70, recommendationDecision: 'RECOMMEND', candidateOrder: 0 }),
    ]);
    expect(ranked.map((r) => r.paperId)).toEqual(['alpha', 'zeta']);
  });

  it('reproduces the Phase 2.5 F1>F3>F4>F2>F5 ranking', () => {
    const f1 = score({ paperId: 'F1', score: 86, recommendationDecision: 'RECOMMEND', candidateOrder: 0 });
    const f2 = score({ paperId: 'F2', score: 61, recommendationDecision: 'STORE_ONLY', candidateOrder: 1 });
    const f3 = score({ paperId: 'F3', score: 73, recommendationDecision: 'RECOMMEND', candidateOrder: 2 });
    const f4 = score({ paperId: 'F4', score: 71, recommendationDecision: 'RECOMMEND', candidateOrder: 3 });
    const f5 = score({ paperId: 'F5', score: 30, recommendationDecision: 'LOW_QUALITY', candidateOrder: 4 });
    const ranked = rankPapers([f2, f5, f1, f4, f3]); // intentionally shuffled
    expect(ranked.map((r) => r.paperId)).toEqual(['F1', 'F3', 'F4', 'F2', 'F5']);
    // Only RECOMMEND decisions within the top-min(10, 5)=5 → F1, F3, F4.
    expect(ranked.filter((r) => r.isRecommended).map((r) => r.paperId)).toEqual(['F1', 'F3', 'F4']);
  });
});

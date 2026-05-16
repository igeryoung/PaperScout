import { describe, expect, it } from 'vitest';
import {
  applyBounds,
  buildCandidateMap,
  checkRecordSchema,
  recomputeTotal,
  resolveJoinKey,
  summarize,
  type FixtureManifest,
  type FixtureId,
  type Bounds,
} from '../../../scripts/prompt-eval/lib';
import type { Candidate } from '../../../src/server/schema/candidate';

function makeCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    title: 'Sample Paper',
    authors: ['Alice'],
    abstract: 'abstract',
    venue: null,
    publishedDate: '2026-05-10',
    sourceUrl: 'https://arxiv.org/abs/2605.00001',
    pdfUrl: 'https://arxiv.org/pdf/2605.00001.pdf',
    sourcePaperId: '2605.00001',
    source: 'ARXIV',
    codeUrls: [],
    additionalSources: [],
    ...overrides,
  };
}

const validScores = {
  novelty: 18,
  methodologicalRigor: 18,
  experimentalQuality: 16,
  venueSourceCredibility: 12,
  authorInstitutionReputation: 10,
  total: 74,
};

const L = (en: string) => ({ en, 'zh-TW': en });
const LL = (en: string[]) => ({ en, 'zh-TW': [...en] });

function makeEvaluation(joinKey: { source: string; sourcePaperId: string }, overrides: Record<string, unknown> = {}) {
  return {
    joinKey,
    evaluationStage: 'FULL_PDF',
    scores: { ...validScores },
    summary: L('summary'),
    recommendationReason: L('reason'),
    keyContribution: L('kc'),
    methodologySummary: L('ms'),
    strengths: LL(['s1']),
    weaknesses: LL(['w1']),
    tags: ['tag'],
    rankingExplanation: L('re'),
    recommendationDecision: 'RECOMMEND',
    pdfAnalysisStatus: 'SUCCESS',
    tableFigureAnalysis: null,
    ...overrides,
  };
}

describe('buildCandidateMap', () => {
  it('maps primary source/paperId to candidate', () => {
    const c = makeCandidate({ source: 'ARXIV', sourcePaperId: 'X' });
    const map = buildCandidateMap([c]);
    expect(map.get('ARXIV:X')).toBe(c);
  });

  it('maps additionalSources to the same candidate (mirrors ingest.ts:65-79)', () => {
    const c = makeCandidate({
      source: 'ARXIV',
      sourcePaperId: 'X',
      additionalSources: [
        { source: 'OPENREVIEW', sourceUrl: 'https://openreview.net/forum?id=Y', sourcePaperId: 'Y' },
      ],
    });
    const map = buildCandidateMap([c]);
    expect(map.get('ARXIV:X')).toBe(c);
    expect(map.get('OPENREVIEW:Y')).toBe(c);
  });

  it('skips candidates with null sourcePaperId', () => {
    const c = makeCandidate({ sourcePaperId: null });
    const map = buildCandidateMap([c]);
    expect(map.size).toBe(0);
  });
});

describe('resolveJoinKey', () => {
  it('returns the matching candidate on a primary key hit', () => {
    const c = makeCandidate({ source: 'ARXIV', sourcePaperId: 'X' });
    const map = buildCandidateMap([c]);
    const evaluation = makeEvaluation({ source: 'ARXIV', sourcePaperId: 'X' });
    const result = resolveJoinKey(evaluation, map);
    expect(result.key).toBe('ARXIV:X');
    expect(result.candidate).toBe(c);
  });

  it('hits via additionalSources', () => {
    const c = makeCandidate({
      source: 'ARXIV',
      sourcePaperId: 'X',
      additionalSources: [
        { source: 'OPENREVIEW', sourceUrl: 'https://openreview.net/forum?id=Y', sourcePaperId: 'Y' },
      ],
    });
    const map = buildCandidateMap([c]);
    const evaluation = makeEvaluation({ source: 'OPENREVIEW', sourcePaperId: 'Y' });
    const result = resolveJoinKey(evaluation, map);
    expect(result.key).toBe('OPENREVIEW:Y');
    expect(result.candidate).toBe(c);
  });

  it('returns null candidate when key is not in the map', () => {
    const map = buildCandidateMap([makeCandidate({ source: 'ARXIV', sourcePaperId: 'X' })]);
    const result = resolveJoinKey(makeEvaluation({ source: 'ARXIV', sourcePaperId: 'Z' }), map);
    expect(result.key).toBe('ARXIV:Z');
    expect(result.candidate).toBeNull();
  });

  it('is defensive over a malformed raw evaluation (missing joinKey)', () => {
    const map = buildCandidateMap([makeCandidate()]);
    const result = resolveJoinKey({ scores: validScores }, map);
    expect(result.key).toBeNull();
    expect(result.candidate).toBeNull();
  });

  it('does not throw on completely garbage input', () => {
    const map = buildCandidateMap([]);
    expect(() => resolveJoinKey(null, map)).not.toThrow();
    expect(() => resolveJoinKey(42, map)).not.toThrow();
    expect(() => resolveJoinKey('string', map)).not.toThrow();
  });
});

describe('recomputeTotal', () => {
  it('reports no mismatch when reported equals sum of dimensions', () => {
    const result = recomputeTotal(validScores);
    expect(result.computed).toBe(74);
    expect(result.reported).toBe(74);
    expect(result.mismatch).toBe(false);
  });

  it('detects a mismatch on a raw object that schema would have rejected', () => {
    const result = recomputeTotal({
      novelty: 5,
      methodologicalRigor: 5,
      experimentalQuality: 5,
      venueSourceCredibility: 5,
      authorInstitutionReputation: 5,
      total: 30,
    });
    expect(result.computed).toBe(25);
    expect(result.reported).toBe(30);
    expect(result.mismatch).toBe(true);
  });

  it('returns null computed when a dimension is missing', () => {
    const result = recomputeTotal({ novelty: 5, total: 5 });
    expect(result.computed).toBeNull();
    expect(result.mismatch).toBe(false);
  });
});

describe('applyBounds', () => {
  const bounds: Bounds = {
    scores: { novelty: { min: 18 }, total: { min: 70 } },
    recommendationDecision: { in: ['RECOMMEND'] },
  };

  it('passes when every check is within range', () => {
    const result = applyBounds(makeEvaluation({ source: 'ARXIV', sourcePaperId: 'X' }), bounds);
    expect(result.passed).toBe(true);
    expect(result.failedChecks).toEqual([]);
  });

  it('reports a min violation with the actual value', () => {
    const result = applyBounds(
      makeEvaluation({ source: 'ARXIV', sourcePaperId: 'X' }, { scores: { ...validScores, novelty: 5, total: 61 } }),
      bounds,
    );
    expect(result.passed).toBe(false);
    expect(result.failedChecks.some((m) => m.includes('scores.novelty < 18'))).toBe(true);
    expect(result.failedChecks.some((m) => m.includes('5'))).toBe(true);
  });

  it('reports an `in` violation', () => {
    const result = applyBounds(
      makeEvaluation(
        { source: 'ARXIV', sourcePaperId: 'X' },
        { recommendationDecision: 'STORE_ONLY' },
      ),
      bounds,
    );
    expect(result.passed).toBe(false);
    expect(result.failedChecks.some((m) => m.includes('STORE_ONLY'))).toBe(true);
  });

  it('is defensive when scores is missing entirely', () => {
    const raw = { joinKey: { source: 'ARXIV', sourcePaperId: 'X' } };
    const result = applyBounds(raw, bounds);
    expect(result.passed).toBe(false);
    expect(result.failedChecks.some((m) => m.includes('scores.novelty missing'))).toBe(true);
  });

  it('does not throw on garbage input', () => {
    expect(() => applyBounds(null, bounds)).not.toThrow();
    expect(() => applyBounds([], bounds)).not.toThrow();
  });
});

describe('checkRecordSchema', () => {
  it('reports a Zod error path for a bad enum value', () => {
    const bad = makeEvaluation(
      { source: 'ARXIV', sourcePaperId: 'X' },
      { recommendationDecision: 'NOT_A_REAL_DECISION' },
    );
    const result = checkRecordSchema(bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.path === 'recommendationDecision')).toBe(true);
  });

  it('passes a well-formed evaluation', () => {
    const ok = makeEvaluation({ source: 'ARXIV', sourcePaperId: 'X' });
    expect(checkRecordSchema(ok).valid).toBe(true);
  });
});

describe('summarize coarse flags', () => {
  function makeManifest(): FixtureManifest {
    const ids: FixtureId[] = ['F1', 'F2', 'F3', 'F4', 'F5'] as FixtureId[];
    return ids.map((fid, i) => ({
      fixtureId: fid,
      primaryKey: `ARXIV:${fid}-${i}`,
      allJoinKeys: [`ARXIV:${fid}-${i}`],
      metadataPath: `fx/${fid}/metadata.json`,
      boundsPath: `fx/${fid}/bounds.json`,
    }));
  }

  function makeFiveCandidates(manifest: FixtureManifest): Candidate[] {
    return manifest.map((m) =>
      makeCandidate({
        source: 'ARXIV',
        sourcePaperId: m.primaryKey.split(':')[1],
        title: m.fixtureId,
      }),
    );
  }

  function evalWithTotal(joinKey: { source: string; sourcePaperId: string }, total: number) {
    const dims = {
      novelty: 0,
      methodologicalRigor: 0,
      experimentalQuality: 0,
      venueSourceCredibility: 0,
      authorInstitutionReputation: total,
    };
    return makeEvaluation(joinKey, { scores: { ...dims, total } });
  }

  it('flags F1 in top 2, F5 in bottom 2, F4 not last for the prior order', () => {
    const manifest = makeManifest();
    const candidates = makeFiveCandidates(manifest);
    const map = buildCandidateMap(candidates);
    const totals: Record<FixtureId, number> = {
      F1: 14,
      F4: 13,
      F3: 12,
      F5: 8,
      F2: 6,
    } as Record<FixtureId, number>;
    const evaluations = manifest.map((m) =>
      evalWithTotal(
        { source: 'ARXIV', sourcePaperId: m.primaryKey.split(':')[1] },
        totals[m.fixtureId],
      ),
    );
    const summary = summarize(evaluations, map, manifest, new Map());
    expect(summary.coarseFlags.f1InTop2).toBe(true);
    expect(summary.coarseFlags.f5InBottom2).toBe(true);
    expect(summary.coarseFlags.f4NotLast).toBe(true);
  });

  it('flags F4 last when F4 has the lowest total', () => {
    const manifest = makeManifest();
    const candidates = makeFiveCandidates(manifest);
    const map = buildCandidateMap(candidates);
    const totals: Record<FixtureId, number> = {
      F1: 14,
      F3: 12,
      F5: 10,
      F2: 8,
      F4: 4,
    } as Record<FixtureId, number>;
    const evaluations = manifest.map((m) =>
      evalWithTotal(
        { source: 'ARXIV', sourcePaperId: m.primaryKey.split(':')[1] },
        totals[m.fixtureId],
      ),
    );
    const summary = summarize(evaluations, map, manifest, new Map());
    expect(summary.coarseFlags.f4NotLast).toBe(false);
  });
});

describe('summarize manifest-driven fixture lookup', () => {
  it('routes an evaluation joinKey to the right fixture via additionalSources', () => {
    const manifest: FixtureManifest = [
      {
        fixtureId: 'F4' as FixtureId,
        primaryKey: 'ARXIV:X',
        allJoinKeys: ['ARXIV:X', 'OPENREVIEW:Y'],
        metadataPath: 'fx/F4/metadata.json',
        boundsPath: 'fx/F4/bounds.json',
      },
    ];
    const c = makeCandidate({
      source: 'ARXIV',
      sourcePaperId: 'X',
      additionalSources: [
        { source: 'OPENREVIEW', sourceUrl: 'https://openreview.net/forum?id=Y', sourcePaperId: 'Y' },
      ],
    });
    const map = buildCandidateMap([c]);
    const evalRaw = makeEvaluation({ source: 'OPENREVIEW', sourcePaperId: 'Y' });
    const summary = summarize([evalRaw], map, manifest, new Map());
    expect(summary.records).toHaveLength(1);
    expect(summary.records[0]?.fixtureId).toBe('F4');
    expect(summary.unmatchedJoinKeys).toEqual([]);
  });

  it('reports a missing fixture when one manifest entry has no evaluation', () => {
    const manifest: FixtureManifest = [
      {
        fixtureId: 'F1' as FixtureId,
        primaryKey: 'ARXIV:X',
        allJoinKeys: ['ARXIV:X'],
        metadataPath: 'fx/F1/metadata.json',
        boundsPath: 'fx/F1/bounds.json',
      },
      {
        fixtureId: 'F2' as FixtureId,
        primaryKey: 'ARXIV:Y',
        allJoinKeys: ['ARXIV:Y'],
        metadataPath: 'fx/F2/metadata.json',
        boundsPath: 'fx/F2/bounds.json',
      },
    ];
    const candidates = [
      makeCandidate({ source: 'ARXIV', sourcePaperId: 'X' }),
      makeCandidate({ source: 'ARXIV', sourcePaperId: 'Y' }),
    ];
    const summary = summarize(
      [makeEvaluation({ source: 'ARXIV', sourcePaperId: 'X' })],
      buildCandidateMap(candidates),
      manifest,
      new Map(),
    );
    expect(summary.fixtureCoverage.complete).toBe(false);
    expect(summary.fixtureCoverage.missingFixtureIds).toEqual(['F2']);
  });

  it('reports duplicate fixture evaluations', () => {
    const manifest: FixtureManifest = [
      {
        fixtureId: 'F1' as FixtureId,
        primaryKey: 'ARXIV:X',
        allJoinKeys: ['ARXIV:X', 'OPENREVIEW:Y'],
        metadataPath: 'fx/F1/metadata.json',
        boundsPath: 'fx/F1/bounds.json',
      },
    ];
    const candidate = makeCandidate({
      source: 'ARXIV',
      sourcePaperId: 'X',
      additionalSources: [
        { source: 'OPENREVIEW', sourceUrl: 'https://openreview.net/forum?id=Y', sourcePaperId: 'Y' },
      ],
    });
    const summary = summarize(
      [
        makeEvaluation({ source: 'ARXIV', sourcePaperId: 'X' }),
        makeEvaluation({ source: 'OPENREVIEW', sourcePaperId: 'Y' }),
      ],
      buildCandidateMap([candidate]),
      manifest,
      new Map(),
    );
    expect(summary.fixtureCoverage.complete).toBe(false);
    expect(summary.fixtureCoverage.duplicateFixtureIds).toEqual(['F1']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { findMatch, type MatcherDeps } from '../../../src/server/dedup/matcher';

function makeDeps(overrides: Partial<MatcherDeps> = {}): MatcherDeps {
  return {
    findBySourcePaperId: vi.fn().mockResolvedValue(null),
    findBySourceUrl: vi.fn().mockResolvedValue(null),
    findByPdfUrl: vi.fn().mockResolvedValue(null),
    findByNormalizedTitle: vi.fn().mockResolvedValue(null),
    listRecentTitles: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

const baseCandidate = {
  title: 'Test Paper',
  authors: ['Alice', 'Bob'],
  sourceUrl: 'https://arxiv.org/abs/2605.0001',
  pdfUrl: 'https://arxiv.org/pdf/2605.0001',
  sourcePaperId: '2605.0001',
  source: 'ARXIV' as const,
  additionalSources: [],
};

describe('findMatch', () => {
  it('returns null when no signal matches', async () => {
    const result = await findMatch(baseCandidate, makeDeps());
    expect(result).toBeNull();
  });

  it('matches by arxiv id first', async () => {
    const deps = makeDeps({
      findBySourcePaperId: vi.fn(async (s, id) =>
        s === 'ARXIV' && id === '2605.0001' ? { paperId: 'paper-1' } : null,
      ),
    });
    const result = await findMatch(baseCandidate, deps);
    expect(result).toEqual({ paperId: 'paper-1', method: 'ARXIV_ID', confidence: 1.0 });
  });

  it('matches by openreview id from additionalSources', async () => {
    const deps = makeDeps({
      findBySourcePaperId: vi.fn(async (s, id) =>
        s === 'OPENREVIEW' && id === 'or-99' ? { paperId: 'paper-2' } : null,
      ),
    });
    const result = await findMatch(
      {
        ...baseCandidate,
        source: 'HUGGINGFACE',
        sourcePaperId: 'hf-slug',
        additionalSources: [
          { source: 'OPENREVIEW', sourceUrl: 'x', sourcePaperId: 'or-99' },
        ],
      },
      deps,
    );
    expect(result).toEqual({ paperId: 'paper-2', method: 'OPENREVIEW_ID', confidence: 1.0 });
  });

  it('matches by source URL', async () => {
    const deps = makeDeps({
      findBySourceUrl: vi.fn(async () => ({ paperId: 'paper-3' })),
    });
    const result = await findMatch(baseCandidate, deps);
    expect(result?.method).toBe('SOURCE_URL');
  });

  it('matches by normalized title', async () => {
    const deps = makeDeps({
      findByNormalizedTitle: vi.fn(async () => ({
        id: 'paper-4',
        title: 'Test Paper',
        authors: ['Alice'],
      })),
    });
    const result = await findMatch(baseCandidate, deps);
    expect(result).toEqual({
      paperId: 'paper-4',
      method: 'NORMALIZED_TITLE',
      confidence: 0.97,
    });
  });

  it('falls through to fuzzy match', async () => {
    const deps = makeDeps({
      listRecentTitles: vi.fn(async () => [
        {
          id: 'paper-5',
          normalizedTitle: 'test paper', // exact-after-normalize, but findByNormalizedTitle would have hit first; so flex it slightly:
          title: 'Test Paper',
          authors: ['Alice'],
        },
      ]),
      findByNormalizedTitle: vi.fn(async () => null),
    });
    const result = await findMatch(
      { ...baseCandidate, title: 'Test  Paper' }, // double space; normalizes to 'test paper'
      deps,
    );
    // When normalizedTitle exact-matches AND author overlaps, it uses NORMALIZED_TITLE? No, repo would have found it.
    // Here repo returns null (per mock), so fuzzy kicks in with sim=1.0.
    expect(result?.method).toBe('FUZZY_TITLE');
    expect(result?.confidence).toBe(1);
  });

  it('rejects fuzzy match when authors do not overlap', async () => {
    const deps = makeDeps({
      listRecentTitles: vi.fn(async () => [
        {
          id: 'paper-6',
          normalizedTitle: 'test paper',
          title: 'Test Paper',
          authors: ['Eve', 'Mallory'],
        },
      ]),
    });
    const result = await findMatch(baseCandidate, deps);
    expect(result).toBeNull();
  });
});

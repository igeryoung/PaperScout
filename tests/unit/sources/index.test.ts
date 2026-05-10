import { describe, expect, it } from 'vitest';
import type { Candidate } from '@/server/schema/candidate';
import { collectFromAllSources, dedupWithinBatch } from '@/server/sources';

function mkCandidate(overrides: Partial<Candidate>): Candidate {
  return {
    title: 'Test Paper',
    authors: ['Alice'],
    abstract: null,
    venue: null,
    publishedDate: '2026-05-09',
    sourceUrl: 'https://arxiv.org/abs/2605.0001',
    pdfUrl: null,
    sourcePaperId: '2605.0001',
    source: 'ARXIV',
    codeUrls: [],
    additionalSources: [],
    ...overrides,
  };
}

describe('dedupWithinBatch', () => {
  it('collapses arxiv↔HF cross-source collision keeping arxiv as primary', () => {
    const arxiv = mkCandidate({
      source: 'ARXIV',
      sourcePaperId: '2605.0001',
      sourceUrl: 'https://arxiv.org/abs/2605.0001',
      codeUrls: ['https://github.com/foo/a'],
    });
    const hf = mkCandidate({
      source: 'HUGGINGFACE',
      sourcePaperId: '2605.0001',
      sourceUrl: 'https://huggingface.co/papers/2605.0001',
      pdfUrl: 'https://arxiv.org/pdf/2605.0001',
      codeUrls: ['https://github.com/foo/b'],
      additionalSources: [
        { source: 'ARXIV', sourceUrl: 'https://arxiv.org/abs/2605.0001', sourcePaperId: '2605.0001' },
      ],
    });

    const out = dedupWithinBatch([hf, arxiv]); // intentionally HF first
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('ARXIV');
    expect(out[0].codeUrls.sort()).toEqual([
      'https://github.com/foo/a',
      'https://github.com/foo/b',
    ]);
  });

  it('collapses by openreview id', () => {
    const a = mkCandidate({
      source: 'OPENREVIEW',
      sourcePaperId: 'forum-1',
      sourceUrl: 'https://openreview.net/forum?id=forum-1',
    });
    const b = mkCandidate({
      source: 'HUGGINGFACE',
      sourcePaperId: '2605.0099',
      sourceUrl: 'https://huggingface.co/papers/2605.0099',
      additionalSources: [
        { source: 'OPENREVIEW', sourceUrl: 'https://openreview.net/forum?id=forum-1', sourcePaperId: 'forum-1' },
      ],
    });
    const out = dedupWithinBatch([a, b]);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('OPENREVIEW');
  });

  it('falls back to normalized title when ids differ', () => {
    const a = mkCandidate({
      title: 'Paper About Vision Transformers',
      source: 'ARXIV',
      sourcePaperId: '2605.0001',
    });
    const b = mkCandidate({
      title: 'paper  about VISION transformers',
      source: 'HUGGINGFACE',
      sourcePaperId: 'hf-foo',
      sourceUrl: 'https://huggingface.co/papers/hf-foo',
      pdfUrl: null,
      additionalSources: [],
    });
    const out = dedupWithinBatch([a, b]);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('ARXIV');
  });

  it('keeps unrelated papers separate', () => {
    const a = mkCandidate({ title: 'A', source: 'ARXIV', sourcePaperId: 'a' });
    const b = mkCandidate({ title: 'B', source: 'ARXIV', sourcePaperId: 'b' });
    expect(dedupWithinBatch([a, b]).length).toBe(2);
  });
});

describe('collectFromAllSources', () => {
  function make(source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE', n: number): Candidate[] {
    return Array.from({ length: n }, (_, i) => {
      const baseUrl =
        source === 'ARXIV'
          ? 'https://arxiv.org/abs/'
          : source === 'OPENREVIEW'
            ? 'https://openreview.net/forum?id='
            : 'https://huggingface.co/papers/';
      const id = `${source}-${i}`;
      return mkCandidate({
        title: `Paper ${source} ${i}`,
        source,
        sourcePaperId: id,
        sourceUrl: `${baseUrl}${id}`,
      });
    });
  }

  it('applies per-source quotas (15/10/5) and trims to 30', async () => {
    const out = await collectFromAllSources({
      fetchers: {
        arxiv: async () => make('ARXIV', 50),
        openreview: async () => make('OPENREVIEW', 50),
        huggingface: async () => make('HUGGINGFACE', 50),
      },
    });
    expect(out.length).toBe(30);
    const counts = { ARXIV: 0, OPENREVIEW: 0, HUGGINGFACE: 0 };
    for (const c of out) counts[c.source]++;
    expect(counts.ARXIV).toBe(15);
    expect(counts.HUGGINGFACE).toBe(10);
    expect(counts.OPENREVIEW).toBe(5);
  });

  it('refills deficit from other sources when one underdelivers', async () => {
    const out = await collectFromAllSources({
      fetchers: {
        arxiv: async () => make('ARXIV', 5),
        openreview: async () => make('OPENREVIEW', 30),
        huggingface: async () => make('HUGGINGFACE', 30),
      },
    });
    expect(out.length).toBe(30);
    const counts = { ARXIV: 0, OPENREVIEW: 0, HUGGINGFACE: 0 };
    for (const c of out) counts[c.source]++;
    expect(counts.ARXIV).toBe(5);
    // 25 remaining filled from leftover OPENREVIEW (priority) + HUGGINGFACE
    expect(counts.OPENREVIEW + counts.HUGGINGFACE).toBe(25);
  });

  it('continues when one source rejects', async () => {
    const out = await collectFromAllSources({
      fetchers: {
        arxiv: async () => {
          throw new Error('boom');
        },
        openreview: async () => make('OPENREVIEW', 20),
        huggingface: async () => make('HUGGINGFACE', 20),
      },
    });
    // Quotas allocate 10 HF + 5 OR; overflow refills the remaining 15 from leftover pool.
    expect(out.length).toBe(30);
    const counts = { ARXIV: 0, OPENREVIEW: 0, HUGGINGFACE: 0 };
    for (const c of out) counts[c.source]++;
    expect(counts.ARXIV).toBe(0);
    expect(counts.OPENREVIEW + counts.HUGGINGFACE).toBe(30);
  });

  it('returns shorter list when total pool is smaller than targetCount', async () => {
    const out = await collectFromAllSources({
      fetchers: {
        arxiv: async () => make('ARXIV', 3),
        openreview: async () => make('OPENREVIEW', 2),
        huggingface: async () => make('HUGGINGFACE', 4),
      },
    });
    expect(out.length).toBe(9); // 3 + 2 + 4 — under target, can't refill further
  });

  it('within-batch dedup runs before quota allocation', async () => {
    // Same arXiv id shows up in both ARXIV and HUGGINGFACE — should collapse.
    const arxiv: Candidate = mkCandidate({
      source: 'ARXIV',
      sourcePaperId: '2605.SHARED',
      sourceUrl: 'https://arxiv.org/abs/2605.SHARED',
    });
    const hf: Candidate = mkCandidate({
      source: 'HUGGINGFACE',
      sourcePaperId: '2605.SHARED',
      sourceUrl: 'https://huggingface.co/papers/2605.SHARED',
      additionalSources: [
        { source: 'ARXIV', sourceUrl: 'https://arxiv.org/abs/2605.SHARED', sourcePaperId: '2605.SHARED' },
      ],
    });
    const out = await collectFromAllSources({
      targetCount: 5,
      fetchers: {
        arxiv: async () => [arxiv],
        openreview: async () => [],
        huggingface: async () => [hf],
      },
    });
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('ARXIV');
  });
});

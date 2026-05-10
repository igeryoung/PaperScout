import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CandidateSchema } from '@/server/schema/candidate';
import { fetchOpenReview, parseOpenReview } from '@/server/sources/openreview';

const FIXTURE = resolve(__dirname, '../../fixtures/sources/openreview.json');

describe('parseOpenReview', () => {
  const json = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const candidates = parseOpenReview(json);

  it('parses ≥1 entry from the fixture', () => {
    // The OpenReview live API can return very few hits for a generic search; assert non-empty
    // to lock the parse path, not a specific count.
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('every parsed entry passes CandidateSchema', () => {
    for (const c of candidates) {
      const r = CandidateSchema.safeParse(c);
      expect(r.success, JSON.stringify(r, null, 2)).toBe(true);
    }
  });

  it('all entries are OPENREVIEW with forum / pdf URLs', () => {
    for (const c of candidates) {
      expect(c.source).toBe('OPENREVIEW');
      expect(c.sourceUrl).toMatch(/^https:\/\/openreview\.net\/forum\?id=/);
      expect(c.pdfUrl).toMatch(/^https:\/\/openreview\.net\/pdf\?id=/);
      expect(c.sourcePaperId).not.toBeNull();
    }
  });

  it('publishedDate is ISO YYYY-MM-DD', () => {
    for (const c of candidates) {
      expect(c.publishedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('fetchOpenReview', () => {
  it('uses injected fetch and returns parsed candidates', async () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const fakeFetch = async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => JSON.parse(text),
      }) as Response;
    const out = await fetchOpenReview({ fetch: fakeFetch });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].source).toBe('OPENREVIEW');
  });
});

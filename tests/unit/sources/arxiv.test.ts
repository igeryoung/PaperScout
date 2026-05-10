import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CandidateSchema } from '@/server/schema/candidate';
import { fetchArxiv, parseArxivAtom } from '@/server/sources/arxiv';

const FIXTURE = resolve(__dirname, '../../fixtures/sources/arxiv.xml');

describe('parseArxivAtom', () => {
  const xml = readFileSync(FIXTURE, 'utf8');
  const candidates = parseArxivAtom(xml);

  it('parses ≥10 entries from the fixture', () => {
    expect(candidates.length).toBeGreaterThanOrEqual(10);
  });

  it('every parsed entry passes CandidateSchema', () => {
    for (const c of candidates) {
      const r = CandidateSchema.safeParse(c);
      expect(r.success, JSON.stringify(r, null, 2)).toBe(true);
    }
  });

  it('all entries have source ARXIV and well-formed identifiers', () => {
    for (const c of candidates) {
      expect(c.source).toBe('ARXIV');
      expect(c.sourceUrl).toMatch(/^https:\/\/arxiv\.org\/abs\//);
      expect(c.sourcePaperId).not.toBeNull();
      expect(c.sourcePaperId).not.toMatch(/v\d+$/); // version suffix stripped
    }
  });

  it('pdfUrls reference the arXiv pdf endpoint', () => {
    const withPdf = candidates.filter((c) => c.pdfUrl !== null);
    expect(withPdf.length).toBeGreaterThan(0);
    for (const c of withPdf) {
      expect(c.pdfUrl).toMatch(/^https?:\/\/arxiv\.org\/pdf\//);
    }
  });

  it('authors list is never empty', () => {
    for (const c of candidates) {
      expect(c.authors.length).toBeGreaterThan(0);
    }
  });

  it('publishedDate is YYYY-MM-DD', () => {
    for (const c of candidates) {
      expect(c.publishedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe('fetchArxiv', () => {
  it('uses injected fetch and returns parsed candidates', async () => {
    const xml = readFileSync(FIXTURE, 'utf8');
    const fakeFetch = async () =>
      ({ ok: true, status: 200, statusText: 'OK', text: async () => xml }) as Response;
    const out = await fetchArxiv({ fetch: fakeFetch });
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].source).toBe('ARXIV');
  });

  it('throws on non-OK responses', async () => {
    const fakeFetch = async () =>
      ({ ok: false, status: 503, statusText: 'Service Unavailable' }) as Response;
    await expect(fetchArxiv({ fetch: fakeFetch })).rejects.toThrow(/503/);
  });
});

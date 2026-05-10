import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CandidateSchema } from '@/server/schema/candidate';
import { fetchHuggingFace, parseHuggingFace } from '@/server/sources/huggingface';

const FIXTURE = resolve(__dirname, '../../fixtures/sources/huggingface.json');

describe('parseHuggingFace', () => {
  const json = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const candidates = parseHuggingFace(json);

  it('parses ≥1 entry from the fixture', () => {
    expect(candidates.length).toBeGreaterThan(0);
  });

  it('every parsed entry passes CandidateSchema', () => {
    for (const c of candidates) {
      const r = CandidateSchema.safeParse(c);
      expect(r.success, JSON.stringify(r, null, 2)).toBe(true);
    }
  });

  it('all entries are HUGGINGFACE with paper-page URLs', () => {
    for (const c of candidates) {
      expect(c.source).toBe('HUGGINGFACE');
      expect(c.sourceUrl).toMatch(/^https:\/\/huggingface\.co\/papers\//);
      expect(c.sourcePaperId).not.toBeNull();
    }
  });

  it('records arXiv-mirrored entries via additionalSources + pdfUrl', () => {
    const withArxiv = candidates.filter((c) =>
      c.additionalSources.some((a) => a.source === 'ARXIV'),
    );
    expect(withArxiv.length).toBeGreaterThan(0);
    for (const c of withArxiv) {
      expect(c.pdfUrl).toMatch(/^https:\/\/arxiv\.org\/pdf\//);
      expect(c.additionalSources[0].source).toBe('ARXIV');
      expect(c.additionalSources[0].sourceUrl).toMatch(/^https:\/\/arxiv\.org\/abs\//);
    }
  });
});

describe('parseHuggingFace CV filter', () => {
  it('drops entries with no CV keywords in title or abstract', () => {
    const synthetic = [
      {
        paper: {
          id: '0001.0001',
          title: 'Quantum Cryptography Methods',
          summary: 'We study post-quantum signature schemes.',
          authors: [{ name: 'Alice' }],
          publishedAt: '2026-05-01T00:00:00.000Z',
        },
      },
    ];
    const out = parseHuggingFace(synthetic);
    expect(out.length).toBe(0);
  });

  it('keeps entries that mention CV keywords', () => {
    const synthetic = [
      {
        paper: {
          id: '0002.0002',
          title: 'A Vision Transformer for Image Segmentation',
          summary: 'We segment images using a new transformer.',
          authors: [{ name: 'Bob' }],
          publishedAt: '2026-05-01T00:00:00.000Z',
        },
      },
    ];
    const out = parseHuggingFace(synthetic);
    expect(out.length).toBe(1);
    expect(out[0].source).toBe('HUGGINGFACE');
  });
});

describe('fetchHuggingFace', () => {
  it('uses injected fetch and returns parsed candidates', async () => {
    const text = readFileSync(FIXTURE, 'utf8');
    const fakeFetch = async () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => JSON.parse(text),
      }) as Response;
    const out = await fetchHuggingFace({ fetch: fakeFetch });
    expect(out.length).toBeGreaterThan(0);
  });
});

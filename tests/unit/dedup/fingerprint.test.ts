import { describe, expect, it } from 'vitest';
import {
  arxivFingerprint,
  openreviewFingerprint,
  makeFingerprint,
  chooseFingerprint,
} from '../../../src/server/dedup/fingerprint';

describe('makeFingerprint', () => {
  it('produces a 64-char hex SHA-256', () => {
    const fp = makeFingerprint({ title: 'A Test', firstAuthor: 'Alice', year: 2026 });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    const a = makeFingerprint({ title: 'A Test', firstAuthor: 'Alice', year: 2026 });
    const b = makeFingerprint({ title: 'A Test', firstAuthor: 'Alice', year: 2026 });
    expect(a).toBe(b);
  });

  it('is normalization-stable (different casing/punct yields same fp)', () => {
    const a = makeFingerprint({ title: 'A Test!', firstAuthor: 'Alice', year: 2026 });
    const b = makeFingerprint({ title: 'a   test', firstAuthor: 'ALICE', year: 2026 });
    expect(a).toBe(b);
  });

  it('changes with title, author, or year', () => {
    const base = makeFingerprint({ title: 'A Test', firstAuthor: 'Alice', year: 2026 });
    expect(base).not.toBe(makeFingerprint({ title: 'B Test', firstAuthor: 'Alice', year: 2026 }));
    expect(base).not.toBe(makeFingerprint({ title: 'A Test', firstAuthor: 'Bob', year: 2026 }));
    expect(base).not.toBe(makeFingerprint({ title: 'A Test', firstAuthor: 'Alice', year: 2025 }));
  });
});

describe('arxiv/openreview fingerprint helpers', () => {
  it('formats arxiv id', () => {
    expect(arxivFingerprint('2605.12345')).toBe('arxiv:2605.12345');
  });
  it('formats openreview id', () => {
    expect(openreviewFingerprint('abc')).toBe('openreview:abc');
  });
});

describe('chooseFingerprint', () => {
  const base = {
    title: 'Some Paper',
    firstAuthor: 'A',
    year: 2026,
  };

  it('prefers arxiv id when source is ARXIV', () => {
    const fp = chooseFingerprint({
      ...base,
      source: 'ARXIV',
      sourcePaperId: '2605.12345',
    });
    expect(fp).toBe('arxiv:2605.12345');
  });

  it('uses additionalSources arxiv id when present', () => {
    const fp = chooseFingerprint({
      ...base,
      source: 'HUGGINGFACE',
      sourcePaperId: 'hf-slug',
      additionalSources: [{ source: 'ARXIV', sourcePaperId: '2605.99999' }],
    });
    expect(fp).toBe('arxiv:2605.99999');
  });

  it('falls back to title-hash when no external id is available', () => {
    const fp = chooseFingerprint({
      ...base,
      source: 'HUGGINGFACE',
      sourcePaperId: null,
    });
    expect(fp).toMatch(/^[a-f0-9]{64}$/);
  });
});

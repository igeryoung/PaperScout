import { describe, expect, it } from 'vitest';
import { normalizeTitle, normalizeAuthor } from '../../../src/server/dedup/normalize';

describe('normalizeTitle', () => {
  it('lowercases', () => {
    expect(normalizeTitle('Hello World')).toBe('hello world');
  });

  it('strips diacritics', () => {
    expect(normalizeTitle('Café Society')).toBe('cafe society');
    expect(normalizeTitle('Pokémon')).toBe('pokemon');
  });

  it('replaces punctuation with single space and collapses', () => {
    expect(normalizeTitle('Hello,  World!  Foo--bar')).toBe('hello world foo bar');
  });

  it('trims', () => {
    expect(normalizeTitle('  spaced  ')).toBe('spaced');
  });

  it('is idempotent', () => {
    const once = normalizeTitle('Attention Is All You Need!');
    const twice = normalizeTitle(once);
    expect(twice).toBe(once);
  });
});

describe('normalizeAuthor', () => {
  it('preserves spaces between names', () => {
    expect(normalizeAuthor('Yann LeCun')).toBe('yann lecun');
  });

  it('strips diacritics', () => {
    expect(normalizeAuthor('Aurélien Géron')).toBe('aurelien geron');
  });

  it('strips punctuation but keeps spaces', () => {
    expect(normalizeAuthor("O'Reilly, Jr.")).toBe('oreilly jr');
  });
});

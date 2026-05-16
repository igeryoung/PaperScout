import { describe, expect, it, vi } from 'vitest';

// `src/lib/locale.ts` is marked `server-only`. Stub it out for unit tests
// before the import is evaluated.
vi.mock('server-only', () => ({}));

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  localized,
  localizedList,
  normalizeLocale,
  pickLocalized,
  pickLocalizedList,
} from '@/lib/locale';

describe('SUPPORTED_LOCALES + DEFAULT_LOCALE', () => {
  it('exposes en and zh-TW', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'zh-TW']);
  });

  it('defaults to zh-TW to match the existing home-page chrome', () => {
    expect(DEFAULT_LOCALE).toBe('zh-TW');
  });
});

describe('normalizeLocale', () => {
  it('returns the locale when it is supported', () => {
    expect(normalizeLocale('en')).toBe('en');
    expect(normalizeLocale('zh-TW')).toBe('zh-TW');
  });

  it('returns null for unsupported / malformed values', () => {
    expect(normalizeLocale('zh-CN')).toBeNull();
    expect(normalizeLocale('')).toBeNull();
    expect(normalizeLocale(undefined)).toBeNull();
    expect(normalizeLocale(null)).toBeNull();
    expect(normalizeLocale('en_US')).toBeNull();
  });
});

describe('pickLocalized', () => {
  it('returns the requested locale when present', () => {
    const value = localized('hello', '你好');
    expect(pickLocalized(value, 'en')).toBe('hello');
    expect(pickLocalized(value, 'zh-TW')).toBe('你好');
  });

  it('falls back to the other locale when the requested one is empty', () => {
    const partial = { en: 'only english', 'zh-TW': '' };
    expect(pickLocalized(partial, 'zh-TW')).toBe('only english');
  });

  it('falls back when the requested locale is missing entirely', () => {
    expect(pickLocalized({ en: 'only english' }, 'zh-TW')).toBe('only english');
    expect(pickLocalized({ 'zh-TW': '只有中文' }, 'en')).toBe('只有中文');
  });

  it('passes plain strings through (migration safety)', () => {
    expect(pickLocalized('legacy string', 'en')).toBe('legacy string');
  });

  it('returns null for missing values', () => {
    expect(pickLocalized(null, 'en')).toBeNull();
    expect(pickLocalized(undefined, 'en')).toBeNull();
    expect(pickLocalized(42, 'en')).toBeNull();
  });
});

describe('pickLocalizedList', () => {
  it('returns the requested locale list', () => {
    const value = localizedList(['a', 'b'], ['甲', '乙']);
    expect(pickLocalizedList(value, 'en')).toEqual(['a', 'b']);
    expect(pickLocalizedList(value, 'zh-TW')).toEqual(['甲', '乙']);
  });

  it('falls back to the other locale when the requested one is absent', () => {
    expect(pickLocalizedList({ en: ['only en'] }, 'zh-TW')).toEqual(['only en']);
  });

  it('treats raw arrays as already-flat (migration safety)', () => {
    expect(pickLocalizedList(['x', 'y'], 'en')).toEqual(['x', 'y']);
  });

  it('returns empty list for missing / malformed values', () => {
    expect(pickLocalizedList(null, 'en')).toEqual([]);
    expect(pickLocalizedList(undefined, 'en')).toEqual([]);
    expect(pickLocalizedList('not a list', 'en')).toEqual([]);
  });

  it('filters out non-string entries', () => {
    expect(
      pickLocalizedList({ en: ['ok', 1, null, 'two'], 'zh-TW': [] }, 'en'),
    ).toEqual(['ok', 'two']);
  });
});

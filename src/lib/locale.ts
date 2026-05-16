import 'server-only';

import { cookies } from 'next/headers';
import {
  SUPPORTED_LOCALES,
  type Locale,
  type LocalizedString,
  type LocalizedStringList,
} from '@/server/schema/evaluation';

export { SUPPORTED_LOCALES } from '@/server/schema/evaluation';
export type { Locale, LocalizedString, LocalizedStringList } from '@/server/schema/evaluation';

export const DEFAULT_LOCALE: Locale = 'zh-TW';
export const LOCALE_COOKIE = 'locale';

export function normalizeLocale(value: string | undefined | null): Locale | null {
  if (!value) return null;
  return (SUPPORTED_LOCALES as readonly string[]).includes(value)
    ? (value as Locale)
    : null;
}

/**
 * Resolve the active locale for a server-rendered request.
 * Precedence: searchParams.locale -> `locale` cookie -> DEFAULT_LOCALE.
 *
 * Pass the URL searchParams the page already awaits (Next 16 returns a Promise);
 * the helper only reads `locale` from it.
 */
export async function getLocale(
  searchParams?: { locale?: string | string[] | undefined },
): Promise<Locale> {
  const fromQuery =
    typeof searchParams?.locale === 'string' ? searchParams.locale : undefined;
  const queryLocale = normalizeLocale(fromQuery);
  if (queryLocale) return queryLocale;

  const cookieStore = await cookies();
  const cookieLocale = normalizeLocale(cookieStore.get(LOCALE_COOKIE)?.value);
  return cookieLocale ?? DEFAULT_LOCALE;
}

/**
 * Pick the active-locale string from a LocalizedString value coming out of
 * Postgres (typed as JsonValue) or the zod schema. Falls back to the other
 * locale if the requested one is missing — important during the rollout, when
 * legacy rows have `zh-TW: null`.
 */
export function pickLocalized(value: unknown, locale: Locale): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  const primary = obj[locale];
  if (typeof primary === 'string' && primary.length > 0) return primary;
  for (const fallback of SUPPORTED_LOCALES) {
    if (fallback === locale) continue;
    const alt = obj[fallback];
    if (typeof alt === 'string' && alt.length > 0) return alt;
  }
  return null;
}

/**
 * Pick the active-locale list from a LocalizedStringList value. Returns []
 * when the value is missing or malformed (consumers render nothing).
 */
export function pickLocalizedList(value: unknown, locale: Locale): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (typeof value !== 'object') return [];
  const obj = value as Record<string, unknown>;
  const primary = obj[locale];
  if (Array.isArray(primary)) {
    return primary.filter((v): v is string => typeof v === 'string');
  }
  for (const fallback of SUPPORTED_LOCALES) {
    if (fallback === locale) continue;
    const alt = obj[fallback];
    if (Array.isArray(alt)) {
      return alt.filter((v): v is string => typeof v === 'string');
    }
  }
  return [];
}

// Re-exported for tests / callers that prefer constructing a value.
export function localized(en: string, zhTW: string): LocalizedString {
  return { en, 'zh-TW': zhTW };
}

export function localizedList(en: string[], zhTW: string[]): LocalizedStringList {
  return { en, 'zh-TW': zhTW };
}

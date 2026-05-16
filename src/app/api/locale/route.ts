import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { LOCALE_COOKIE, normalizeLocale } from '@/lib/locale';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const raw = (body as { locale?: unknown } | null)?.locale;
  const locale = typeof raw === 'string' ? normalizeLocale(raw) : null;
  if (!locale) {
    return NextResponse.json({ error: 'invalid_locale' }, { status: 400 });
  }

  const store = await cookies();
  store.set({
    name: LOCALE_COOKIE,
    value: locale,
    path: '/',
    httpOnly: false,
    sameSite: 'lax',
    maxAge: ONE_YEAR_SECONDS,
  });

  return new NextResponse(null, { status: 204 });
}

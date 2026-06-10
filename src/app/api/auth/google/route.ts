import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { buildGoogleAuthorizationUrl, createOAuthState } from '@/server/auth/google';
import { getAuthConfig } from '@/server/auth/config';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getAuthConfig();
  const state = createOAuthState(config.authSecret);
  const store = await cookies();

  store.set({
    name: OAUTH_STATE_COOKIE,
    value: state,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.appBaseUrl.startsWith('https://'),
    maxAge: OAUTH_STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(buildGoogleAuthorizationUrl({ config, state }));
}

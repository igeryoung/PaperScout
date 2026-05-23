import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { getAuthConfig } from '@/server/auth/config';
import { completeGoogleLogin } from '@/server/auth/google';
import {
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  sessionCookie,
} from '@/server/auth/session';
import { usersRepo } from '@/server/repos/users';
import { sessionsRepo } from '@/server/repos/sessions';

export const dynamic = 'force-dynamic';

const repos = {
  users: usersRepo,
  sessions: sessionsRepo,
};

function redirectTo(configAppBaseUrl: string, path: string) {
  return NextResponse.redirect(new URL(path, configAppBaseUrl));
}

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  const code = request.nextUrl.searchParams.get('code');
  const state = request.nextUrl.searchParams.get('state');
  const store = await cookies();

  if (!code) {
    return redirectTo(config.appBaseUrl, '/?auth=google_missing_code');
  }

  try {
    const result = await completeGoogleLogin({
      code,
      state,
      expectedState: store.get(OAUTH_STATE_COOKIE)?.value,
      config,
      repos,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      userAgent: request.headers.get('user-agent'),
    });

    store.delete(OAUTH_STATE_COOKIE);
    store.set(sessionCookie(result.sessionToken, config.appBaseUrl.startsWith('https://')));

    return redirectTo(config.appBaseUrl, '/');
  } catch {
    store.delete(OAUTH_STATE_COOKIE);
    store.delete(SESSION_COOKIE);
    return redirectTo(config.appBaseUrl, '/?auth=google_failed');
  }
}

import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getAuthConfig } from '@/server/auth/config';
import { getCurrentSession } from '@/server/auth/current-user';
import { expiredSessionCookie, hashSessionToken, SESSION_COOKIE } from '@/server/auth/session';
import { sessionsRepo } from '@/server/repos/sessions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ session });
}

export async function DELETE() {
  const config = getAuthConfig();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    await sessionsRepo.deleteByTokenHash(hashSessionToken(token));
  }

  store.set(expiredSessionCookie(config.appBaseUrl.startsWith('https://')));
  return new NextResponse(null, { status: 204 });
}

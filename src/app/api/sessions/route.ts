import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/server/auth/current-user';
import { sessionsRepo } from '@/server/repos/sessions';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sessions = await sessionsRepo.listForUser(session.user.id);
  return NextResponse.json({ sessions });
}

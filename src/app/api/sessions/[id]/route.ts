import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/server/auth/current-user';
import { sessionsRepo } from '@/server/repos/sessions';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  await sessionsRepo.deleteForUser({ userId: session.user.id, sessionId: id });
  return new NextResponse(null, { status: 204 });
}

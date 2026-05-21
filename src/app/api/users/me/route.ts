import 'server-only';

import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/server/auth/current-user';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ user: session.user });
}

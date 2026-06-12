import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentSession } from '@/server/auth/current-user';
import { commentsRepo } from '@/server/repos/comments';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string; commentId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { commentId } = await context.params;
  const deleted = await commentsRepo.deleteOwn({
    commentId,
    userId: session.user.id,
  });
  if (!deleted) {
    return NextResponse.json({ error: 'comment_not_found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/server/auth/current-user';
import { commentsRepo } from '@/server/repos/comments';
import { papersRepo } from '@/server/repos/papers';

export const dynamic = 'force-dynamic';

const CreateCommentSchema = z.object({
  content: z.string().trim().min(1).max(5000),
});

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const comments = await commentsRepo.listByPaper(id);
  return NextResponse.json({ comments });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = CreateCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const paper = await papersRepo.findDetailById(id);
  if (!paper) {
    return NextResponse.json({ error: 'paper_not_found' }, { status: 404 });
  }

  const comment = await commentsRepo.create({
    paperId: id,
    userId: session.user.id,
    content: parsed.data.content,
  });
  return NextResponse.json({ comment }, { status: 201 });
}

import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/server/auth/current-user';
import { libraryRepo } from '@/server/repos/library';

export const dynamic = 'force-dynamic';

const PaperStatusSchema = z.enum(['UNREAD', 'READING', 'READ', 'ARCHIVED']);

const AddPaperSchema = z.object({
  collectionId: z.string().uuid().optional().nullable(),
});

const UpdatePaperSchema = z
  .object({
    liked: z.boolean().optional(),
    status: PaperStatusSchema.optional(),
    note: z.string().max(20000).optional().nullable(),
  })
  .refine(
    (v) => v.liked !== undefined || v.status !== undefined || v.note !== undefined,
    { message: 'No fields to update' },
  );

const RemovePaperSchema = z.object({
  collectionId: z.string().uuid().optional().nullable(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ paperId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = AddPaperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { paperId } = await context.params;
  const collection = await libraryRepo.addPaperToCollection({
    userId: session.user.id,
    paperId,
    collectionId: parsed.data.collectionId,
  });
  if (!collection) {
    return NextResponse.json({ error: 'collection_not_found' }, { status: 404 });
  }
  return NextResponse.json({ collection });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ paperId: string }> },
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

  const parsed = UpdatePaperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { paperId } = await context.params;
  const state = await libraryRepo.updatePaperState({
    userId: session.user.id,
    paperId,
    ...parsed.data,
  });
  return NextResponse.json({ state });
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ paperId: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = RemovePaperSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { paperId } = await context.params;
  await libraryRepo.removePaper({
    userId: session.user.id,
    paperId,
    collectionId: parsed.data.collectionId,
  });
  return new NextResponse(null, { status: 204 });
}

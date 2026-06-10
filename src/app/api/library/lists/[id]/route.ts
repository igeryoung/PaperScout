import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/server/auth/current-user';
import { libraryRepo } from '@/server/repos/library';

export const dynamic = 'force-dynamic';

const UpdateCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'No fields to update',
  });

export async function PATCH(
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

  const parsed = UpdateCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  try {
    const collection = await libraryRepo.updateCollection({
      userId: session.user.id,
      collectionId: id,
      ...parsed.data,
    });
    return NextResponse.json({ collection });
  } catch {
    return NextResponse.json({ error: 'not_found_or_duplicate' }, { status: 404 });
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  const result = await libraryRepo.deleteCollection({
    userId: session.user.id,
    collectionId: id,
  });
  if (result.defaultCollection) {
    return NextResponse.json({ error: 'default_collection_locked' }, { status: 409 });
  }
  if (result.deleted === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}

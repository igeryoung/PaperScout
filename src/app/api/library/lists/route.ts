import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/server/auth/current-user';
import { libraryRepo } from '@/server/repos/library';

export const dynamic = 'force-dynamic';

const CreateCollectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
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

  const parsed = CreateCollectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const collection = await libraryRepo.createCollection({
      userId: session.user.id,
      ...parsed.data,
    });
    return NextResponse.json({ collection }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'collection_exists' }, { status: 409 });
  }
}

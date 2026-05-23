import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCurrentSession } from '@/server/auth/current-user';
import { usersRepo } from '@/server/repos/users';

export const dynamic = 'force-dynamic';

const UpdateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    localePreference: z.enum(['en', 'zh-TW']).optional(),
  })
  .refine((v) => v.name !== undefined || v.localePreference !== undefined, {
    message: 'No fields to update',
  });

export async function GET() {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ user: session.user });
}

export async function PATCH(req: NextRequest) {
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

  const parsed = UpdateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_body', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await usersRepo.updateProfile(session.user.id, parsed.data);
  return NextResponse.json({ user });
}

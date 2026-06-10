import { cookies } from 'next/headers';
import { hashSessionToken, SESSION_COOKIE } from './session';
import { sessionsRepo } from '@/server/repos/sessions';

export async function getCurrentSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await sessionsRepo.findCurrentByTokenHash(hashSessionToken(token));
  if (!session || session.user.disabledAt) return null;

  await sessionsRepo.touch(session.id);
  return session;
}

export async function requireCurrentSession() {
  const session = await getCurrentSession();
  if (!session) {
    return null;
  }
  return session;
}

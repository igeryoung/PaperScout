import { sha256, randomToken } from './crypto';

export const SESSION_COOKIE = 'paperscout_session';
export const OAUTH_STATE_COOKIE = 'paperscout_oauth_state';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
export const OAUTH_STATE_TTL_SECONDS = 60 * 10;

export type SessionCookieOptions = {
  name: string;
  value: string;
  path: string;
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  maxAge: number;
};

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomToken(48);
  return { token, tokenHash: sha256(token) };
}

export function hashSessionToken(token: string): string {
  return sha256(token);
}

export function sessionExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
}

export function sessionCookie(token: string, secure: boolean): SessionCookieOptions {
  return {
    name: SESSION_COOKIE,
    value: token,
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_TTL_SECONDS,
  };
}

export function expiredSessionCookie(secure: boolean): SessionCookieOptions {
  return {
    ...sessionCookie('', secure),
    maxAge: 0,
  };
}

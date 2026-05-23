import { describe, expect, it, vi } from 'vitest';
import {
  buildGoogleAuthorizationUrl,
  completeGoogleLogin,
  createOAuthState,
  exchangeGoogleCodeForProfile,
  type AuthRepositories,
} from '@/server/auth/google';
import type { AuthConfig } from '@/server/auth/config';

const config: AuthConfig = {
  appBaseUrl: 'https://paperscout.test',
  authSecret: 'x'.repeat(32),
  googleClientId: 'google-client-id',
  googleClientSecret: 'google-client-secret',
};

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

describe('Google auth service', () => {
  it('builds a Google authorization URL with the callback, scopes, and CSRF state', () => {
    const url = new URL(
      buildGoogleAuthorizationUrl({
        config,
        state: 'state-123',
      }),
    );

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.pathname).toBe('/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('google-client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://paperscout.test/api/auth/google/callback',
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('response_type')).toBe('code');
  });

  it('rejects an OAuth callback when the state does not match the cookie', async () => {
    const fetcher = vi.fn();
    const repos = {
      users: { upsertGoogleUser: vi.fn() },
      sessions: { create: vi.fn() },
    } satisfies AuthRepositories;

    await expect(
      completeGoogleLogin({
        code: 'code-123',
        state: 'request-state',
        expectedState: 'cookie-state',
        config,
        repos,
        fetcher,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toThrow('Invalid OAuth state');

    expect(fetcher).not.toHaveBeenCalled();
    expect(repos.users.upsertGoogleUser).not.toHaveBeenCalled();
    expect(repos.sessions.create).not.toHaveBeenCalled();
  });

  it('rejects a Google profile when the email is not verified', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          sub: 'google-123',
          email: 'user@example.com',
          email_verified: false,
        }),
      );

    await expect(
      exchangeGoogleCodeForProfile({
        code: 'code-123',
        config,
        fetcher,
      }),
    ).rejects.toThrow('Google email is not verified');
  });

  it('creates a local user and hashed session for a verified Google account', async () => {
    const state = createOAuthState(config.authSecret);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ access_token: 'access-token' }))
      .mockResolvedValueOnce(
        jsonResponse({
          sub: 'google-123',
          email: 'user@example.com',
          name: 'Ada User',
          picture: 'https://example.com/avatar.png',
          email_verified: true,
        }),
      );
    const user = {
      id: 'user-123',
      email: 'user@example.com',
      name: 'Ada User',
      avatarUrl: 'https://example.com/avatar.png',
      disabledAt: null,
    };
    const repos = {
      users: {
        upsertGoogleUser: vi.fn().mockResolvedValue(user),
      },
      sessions: {
        create: vi.fn().mockResolvedValue({ id: 'session-123' }),
      },
    } satisfies AuthRepositories;

    const result = await completeGoogleLogin({
      code: 'code-123',
      state,
      expectedState: state,
      config,
      repos,
      fetcher,
      ipAddress: '203.0.113.10',
      userAgent: 'Vitest',
      now: new Date('2026-05-19T00:00:00.000Z'),
    });

    expect(repos.users.upsertGoogleUser).toHaveBeenCalledWith({
      googleId: 'google-123',
      email: 'user@example.com',
      name: 'Ada User',
      avatarUrl: 'https://example.com/avatar.png',
      emailVerified: true,
    });
    expect(repos.sessions.create).toHaveBeenCalledWith({
      userId: 'user-123',
      tokenHash: expect.any(String),
      expiresAt: new Date('2026-06-18T00:00:00.000Z'),
      ipAddress: '203.0.113.10',
      userAgent: 'Vitest',
    });
    expect(result.user).toBe(user);
    expect(result.sessionToken.length).toBeGreaterThan(40);
    expect(result.expiresAt).toEqual(new Date('2026-06-18T00:00:00.000Z'));
    expect(repos.sessions.create.mock.calls[0][0].tokenHash).not.toBe(result.sessionToken);
  });
});

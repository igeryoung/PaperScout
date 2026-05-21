import { hmacSha256, timingSafeEqual, randomToken } from './crypto';
import { createSessionToken, sessionExpiresAt } from './session';
import type { AuthConfig } from './config';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export type GoogleProfile = {
  googleId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  disabledAt: Date | null;
};

export type AuthRepositories = {
  users: {
    upsertGoogleUser(profile: GoogleProfile): Promise<AuthUser>;
  };
  sessions: {
    create(input: {
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      ipAddress: string | null;
      userAgent: string | null;
    }): Promise<unknown>;
  };
};

export type FetchLike = typeof fetch;

export function googleRedirectUri(config: AuthConfig): string {
  return new URL('/api/auth/google/callback', config.appBaseUrl).toString();
}

export function buildGoogleAuthorizationUrl(input: {
  config: AuthConfig;
  state: string;
}): string {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set('client_id', input.config.googleClientId);
  url.searchParams.set('redirect_uri', googleRedirectUri(input.config));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', input.state);
  url.searchParams.set('prompt', 'select_account');
  return url.toString();
}

export function createOAuthState(secret: string): string {
  const nonce = randomToken(32);
  return `${nonce}.${hmacSha256(nonce, secret)}`;
}

export function verifyOAuthState(
  received: string | null,
  expected: string | undefined,
  secret: string,
): boolean {
  if (!received || !expected) return false;
  const [nonce, signature] = received.split('.');
  if (!nonce || !signature) return false;
  return (
    timingSafeEqual(signature, hmacSha256(nonce, secret)) &&
    timingSafeEqual(received, expected)
  );
}

export async function exchangeGoogleCodeForProfile(input: {
  code: string;
  config: AuthConfig;
  fetcher?: FetchLike;
}): Promise<GoogleProfile> {
  const fetcher = input.fetcher ?? fetch;
  const tokenResponse = await fetcher(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: input.code,
      client_id: input.config.googleClientId,
      client_secret: input.config.googleClientSecret,
      redirect_uri: googleRedirectUri(input.config),
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    throw new Error('Google token exchange failed');
  }

  const tokenJson = (await tokenResponse.json()) as { access_token?: unknown };
  if (typeof tokenJson.access_token !== 'string' || tokenJson.access_token.length === 0) {
    throw new Error('Google token response did not include an access token');
  }

  const profileResponse = await fetcher(GOOGLE_USERINFO_URL, {
    headers: { authorization: `Bearer ${tokenJson.access_token}` },
  });

  if (!profileResponse.ok) {
    throw new Error('Google profile lookup failed');
  }

  const profileJson = (await profileResponse.json()) as {
    sub?: unknown;
    email?: unknown;
    name?: unknown;
    picture?: unknown;
    email_verified?: unknown;
  };

  if (typeof profileJson.sub !== 'string' || typeof profileJson.email !== 'string') {
    throw new Error('Google profile response is missing identity fields');
  }

  if (profileJson.email_verified !== true) {
    throw new Error('Google email is not verified');
  }

  return {
    googleId: profileJson.sub,
    email: profileJson.email,
    name: typeof profileJson.name === 'string' ? profileJson.name : null,
    avatarUrl: typeof profileJson.picture === 'string' ? profileJson.picture : null,
    emailVerified: true,
  };
}

export async function completeGoogleLogin(input: {
  code: string;
  state: string | null;
  expectedState: string | undefined;
  config: AuthConfig;
  repos: AuthRepositories;
  fetcher?: FetchLike;
  ipAddress: string | null;
  userAgent: string | null;
  now?: Date;
}): Promise<{ user: AuthUser; sessionToken: string; expiresAt: Date }> {
  if (!verifyOAuthState(input.state, input.expectedState, input.config.authSecret)) {
    throw new Error('Invalid OAuth state');
  }

  const profile = await exchangeGoogleCodeForProfile({
    code: input.code,
    config: input.config,
    fetcher: input.fetcher,
  });
  const user = await input.repos.users.upsertGoogleUser(profile);
  if (user.disabledAt) {
    throw new Error('User account is disabled');
  }

  const session = createSessionToken();
  const expiresAt = sessionExpiresAt(input.now);
  await input.repos.sessions.create({
    userId: user.id,
    tokenHash: session.tokenHash,
    expiresAt,
    ipAddress: input.ipAddress,
    userAgent: input.userAgent,
  });

  return { user, sessionToken: session.token, expiresAt };
}

import { env } from '@/lib/env';

export type AuthConfig = {
  appBaseUrl: string;
  authSecret: string;
  googleClientId: string;
  googleClientSecret: string;
};

export function getAuthConfig(): AuthConfig {
  const missing = [
    ['APP_BASE_URL', env.APP_BASE_URL],
    ['AUTH_SECRET', env.AUTH_SECRET],
    ['GOOGLE_CLIENT_ID', env.GOOGLE_CLIENT_ID],
    ['GOOGLE_CLIENT_SECRET', env.GOOGLE_CLIENT_SECRET],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Google auth is not configured. Missing: ${missing.join(', ')}`);
  }

  return {
    appBaseUrl: env.APP_BASE_URL!,
    authSecret: env.AUTH_SECRET!,
    googleClientId: env.GOOGLE_CLIENT_ID!,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET!,
  };
}

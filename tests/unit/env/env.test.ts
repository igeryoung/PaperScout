import { afterEach, describe, expect, it, vi } from 'vitest';

describe('env', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('throws a readable error when DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('LOG_LEVEL', 'info');
    vi.resetModules();

    await expect(import('@/lib/env')).rejects.toThrow(
      /Invalid environment variables:\n\s+- DATABASE_URL: DATABASE_URL is required/,
    );
  });

  it('does not require an Anthropic API key', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://postgres:password@nozomi.proxy.rlwy.net:28727/railway',
    );
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.resetModules();

    const { env } = await import('@/lib/env');

    expect(env.DATABASE_URL).toContain('nozomi.proxy.rlwy.net:28727/railway');
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
  });

  it('does not require Google auth variables unless the auth routes are used', async () => {
    vi.stubEnv(
      'DATABASE_URL',
      'postgresql://postgres:password@nozomi.proxy.rlwy.net:28727/railway',
    );
    vi.stubEnv('APP_BASE_URL', '');
    vi.stubEnv('AUTH_SECRET', '');
    vi.stubEnv('GOOGLE_CLIENT_ID', '');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    vi.resetModules();

    const { env } = await import('@/lib/env');

    expect(env.APP_BASE_URL).toBeUndefined();
    expect(env.GOOGLE_CLIENT_ID).toBeUndefined();
  });
});

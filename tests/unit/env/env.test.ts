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
      'postgresql://paperscout:paperscout@localhost:5432/paperscout?schema=public',
    );
    vi.stubEnv('LOG_LEVEL', 'debug');
    vi.resetModules();

    const { env } = await import('@/lib/env');

    expect(env.DATABASE_URL).toContain('postgresql://paperscout');
    expect(env).not.toHaveProperty('ANTHROPIC_API_KEY');
  });
});

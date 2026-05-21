import { z } from 'zod';

const optionalNonEmpty = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required (see .env.example)')
    .url('DATABASE_URL must be a valid URL'),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .optional()
    .default('info'),
  NODE_ENV: z.enum(['development', 'test', 'production']).optional().default('development'),
  APP_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url('APP_BASE_URL must be a valid URL').optional(),
  ),
  AUTH_SECRET: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().min(32, 'AUTH_SECRET must be at least 32 characters').optional(),
  ),
  GOOGLE_CLIENT_ID: optionalNonEmpty,
  GOOGLE_CLIENT_SECRET: optionalNonEmpty,
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

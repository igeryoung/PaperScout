import { PrismaClient } from '@prisma/client';
import { env } from './env';

declare global {
  var __prisma: PrismaClient | undefined;
}

export const db =
  globalThis.__prisma ??
  new PrismaClient({
    log: env.LOG_LEVEL === 'debug' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.__prisma = db;
}

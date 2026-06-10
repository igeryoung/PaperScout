// IMPORTANT: This file runs top-level side effects to point DATABASE_URL at the
// test schema BEFORE any module that imports `@/lib/db` is evaluated. Integration
// test files MUST import this file first (e.g. `import './setup'` as the first
// statement) so the env mutation occurs before db.ts is initialized.

import { execSync } from 'node:child_process';

const TEST_URL = process.env.DATABASE_URL_TEST;
const RUN_INTEGRATION = process.env.RUN_INTEGRATION === '1';

if (RUN_INTEGRATION && TEST_URL) {
  process.env.DATABASE_URL = TEST_URL;
}

export const SHOULD_RUN_INTEGRATION = RUN_INTEGRATION && !!TEST_URL;

const TRUNCATE_SQL = `TRUNCATE
  sessions,
  paper_run_results,
  paper_duplicates,
  paper_code_links,
  paper_tags,
  paper_evaluations,
  paper_feedback,
  paper_sources,
  papers,
  daily_runs,
  users
RESTART IDENTITY CASCADE;`;

export async function setupTestDb(): Promise<void> {
  if (!SHOULD_RUN_INTEGRATION) return;
  // Apply migrations against the test schema. Idempotent: prisma exits 0 when nothing to do.
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_URL },
  });
  const { db } = await import('@/lib/db');
  await db.$executeRawUnsafe(TRUNCATE_SQL);
}

export async function cleanupTestDb(): Promise<void> {
  if (!SHOULD_RUN_INTEGRATION) return;
  const { db } = await import('@/lib/db');
  await db.$executeRawUnsafe(TRUNCATE_SQL);
  await db.$disconnect();
}

import 'server-only';

import { logger } from '@/lib/logger';
import { runsRepo } from '@/server/repos/runs';
import { collect } from './collect';
import { persistCandidates } from './persist';

/**
 * Create a DailyRun row in `RUNNING` state and return its id immediately.
 * The route handler is responsible for scheduling
 * `runCollectionInBackground(id)` (typically via `after()` from next/server)
 * so the response can return before collection finishes.
 */
export async function startRun(): Promise<{ id: string; status: 'RUNNING' }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const run = await runsRepo.create({
    runDate: today,
    ingestSourceDir: null,
    candidateCount: 30,
  });
  return { id: run.id, status: 'RUNNING' };
}

/**
 * Run collect → persist for `runId`, marking the run COMPLETED on success
 * or FAILED on error. Errors are logged, never thrown out of this function,
 * so the framework's after()/background runner doesn't see unhandled rejections.
 */
export async function runCollectionInBackground(runId: string): Promise<void> {
  try {
    const candidates = await collect(runId);
    const summary = await persistCandidates(runId, candidates);
    logger.info(
      {
        event: 'run_collection_persisted',
        runId,
        targetCount: 30,
        collectedCount: candidates.length,
        persistedCount: summary.newCount + summary.existingCount - summary.skipped,
        isPartial: candidates.length < 30,
        summary,
      },
      'Run collection persisted',
    );
    await runsRepo.setStatus(runId, 'COMPLETED', true);
  } catch (err) {
    logger.error({ event: 'run_collection_failed', runId, err }, 'Run collection failed');
    try {
      await runsRepo.setStatus(runId, 'FAILED', true);
    } catch (statusErr) {
      logger.error(
        { event: 'run_status_update_failed', runId, status: 'FAILED', err: statusErr },
        'Could not mark run failed',
      );
    }
  }
}

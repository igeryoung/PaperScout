import type { Candidate } from '@/server/schema/candidate';
import { logger } from '@/lib/logger';
import { collectFromAllSources } from '@/server/sources';

/**
 * Thin wrapper so persist + runner depend on a stable seam that tests can mock.
 */
export async function collect(runId: string): Promise<Candidate[]> {
  logger.info(
    { event: 'collection_started', runId, sources: ['ARXIV', 'OPENREVIEW', 'HUGGINGFACE'] },
    'Collection started',
  );
  return collectFromAllSources({ targetCount: 30 });
}

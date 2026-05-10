// Re-export the canonical Candidate schema from Phase 0.5 so source clients,
// the aggregator, and the pipeline all speak the same shape.
export {
  CandidateSchema,
  CandidatesFileSchema,
  SourceEnum,
  AdditionalSourceSchema,
} from '@/server/schema/candidate';
export type { Candidate as CandidateRecord, SourceType } from '@/server/schema/candidate';

import type { Candidate } from '@/server/schema/candidate';

export type SourceName = 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE';

export type FetchFn = typeof globalThis.fetch;

export interface ClientDeps {
  fetch?: FetchFn;
  timeoutMs?: number;
}

export interface SourceFetchResult {
  name: SourceName;
  candidates: Candidate[];
  error?: string;
}

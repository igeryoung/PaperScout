import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import type { CollectionStatus, Prisma } from '@prisma/client';
import {
  ALL_PAPERS_REVALIDATE,
  ALL_PAPERS_TAG,
  paperCardInclude,
  reviveDate,
  revivePaperCardDates,
} from '@/server/repos/papers';

// Card-level paper payload only (no digest/strengths/weaknesses JSON) — the
// home feed and run-detail page render PaperFeedCard / PaperCard, which never
// show those fields. The /papers/[id] page loads the full detail separately.
const cardInclude = {
  paper: { include: paperCardInclude },
} as const satisfies Prisma.PaperRunResultInclude;

export type RunResultWithDetail = Prisma.PaperRunResultGetPayload<{
  include: typeof cardInclude;
}>;

/** Uncached query behind findByRunWithDetail; see that method for the contract. */
async function queryByRunWithDetail(
  runId: string,
  recommendedOnly: boolean,
  limit: number | null,
  offset: number | null,
): Promise<RunResultWithDetail[]> {
  return db.paperRunResult.findMany({
    where: { runId, ...(recommendedOnly ? { isRecommended: true } : {}) },
    orderBy: [{ finalRank: 'asc' }, { id: 'asc' }],
    ...(limit ? { take: limit } : {}),
    ...(offset ? { skip: offset } : {}),
    include: cardInclude,
  });
}

// A run's results only change during ingest, and the payload is identical for
// every visitor (per-user like/read-later state is fetched separately), so the
// joined feed query is cached per (runId, filter) under the shared papers tag.
const getCachedRunResults = unstable_cache(queryByRunWithDetail, ['run-results-card'], {
  tags: [ALL_PAPERS_TAG],
  revalidate: ALL_PAPERS_REVALIDATE,
});

function reviveRunResultDates(result: RunResultWithDetail): RunResultWithDetail {
  return {
    ...result,
    createdAt: reviveDate(result.createdAt),
    paper: revivePaperCardDates(result.paper),
  };
}

export const runResultsRepo = {
  create: (input: {
    runId: string;
    paperId: string;
    collectionStatus: CollectionStatus;
  }) =>
    db.paperRunResult.create({
      data: {
        runId: input.runId,
        paperId: input.paperId,
        collectionStatus: input.collectionStatus,
      },
    }),

  updateRanking: (runId: string, paperId: string, finalRank: number, isRecommended: boolean) =>
    db.paperRunResult.update({
      where: { runId_paperId: { runId, paperId } },
      data: { finalRank, isRecommended },
    }),

  findByRun: (runId: string) =>
    db.paperRunResult.findMany({
      where: { runId },
      orderBy: { finalRank: 'asc' },
    }),

  findRecommendedByRun: (runId: string) =>
    db.paperRunResult.findMany({
      where: { runId, isRecommended: true },
      orderBy: { finalRank: 'asc' },
    }),

  countByRun: (
    runId: string,
    opts: { recommendedOnly?: boolean } = {},
  ): Promise<number> =>
    db.paperRunResult.count({
      where: { runId, ...(opts.recommendedOnly ? { isRecommended: true } : {}) },
    }),

  /**
   * Joined view for the home feed and run-detail page. Returns ranked results
   * with the card-level paper payload: best-evaluation fields, tags, sources,
   * code links, figure metadata. Cached (tag: ALL_PAPERS_TAG).
   */
  findByRunWithDetail: async (
    runId: string,
    opts: { recommendedOnly?: boolean; limit?: number; offset?: number } = {
      recommendedOnly: false,
    },
  ): Promise<RunResultWithDetail[]> => {
    const rows = await getCachedRunResults(
      runId,
      opts.recommendedOnly ?? false,
      opts.limit ?? null,
      opts.offset ?? null,
    );
    return rows.map(reviveRunResultDates);
  },
};

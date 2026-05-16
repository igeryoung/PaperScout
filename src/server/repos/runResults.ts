import { db } from '@/lib/db';
import type { CollectionStatus, Prisma } from '@prisma/client';

const detailInclude = {
  paper: {
    include: {
      evaluations: true,
      tags: true,
      sources: true,
      codeLinks: true,
      figure: {
        select: {
          caption: true,
          figureLabel: true,
          pageNumber: true,
          mimeType: true,
        },
      },
    },
  },
} as const satisfies Prisma.PaperRunResultInclude;

export type RunResultWithDetail = Prisma.PaperRunResultGetPayload<{
  include: typeof detailInclude;
}>;

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

  /**
   * Joined view for the Phase 4 run-detail page. Returns ranked results with
   * the full paper payload: evaluations, tags, sources, code links. The page
   * picks the best evaluation per paper via selectBestEvaluation().
   */
  findByRunWithDetail: (
    runId: string,
    opts: { recommendedOnly: boolean } = { recommendedOnly: false },
  ): Promise<RunResultWithDetail[]> =>
    db.paperRunResult.findMany({
      where: { runId, ...(opts.recommendedOnly ? { isRecommended: true } : {}) },
      orderBy: [{ finalRank: 'asc' }, { id: 'asc' }],
      include: detailInclude,
    }),
};

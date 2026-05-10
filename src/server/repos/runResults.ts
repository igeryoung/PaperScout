import { db } from '@/lib/db';
import type { CollectionStatus } from '@prisma/client';

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
};

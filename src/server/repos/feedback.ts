import { db } from '@/lib/db';

/**
 * Upsert is done manually because the composite unique key
 * `(paperId, runId, userId)` includes nullable columns, which Prisma's
 * typed compound-where helper rejects.
 */
export const feedbackRepo = {
  upsert: async (input: {
    paperId: string;
    runId: string | null;
    userId: string | null;
    starRating: number;
    comment: string | null;
  }) => {
    const existing = await db.paperFeedback.findFirst({
      where: {
        paperId: input.paperId,
        runId: input.runId,
        userId: input.userId,
      },
    });
    if (existing) {
      return db.paperFeedback.update({
        where: { id: existing.id },
        data: {
          starRating: input.starRating,
          comment: input.comment,
        },
      });
    }
    return db.paperFeedback.create({ data: input });
  },

  findByPaper: (paperId: string) => db.paperFeedback.findMany({ where: { paperId } }),
};

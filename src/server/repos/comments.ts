import { db } from '@/lib/db';

const COMMENT_INCLUDE = {
  user: { select: { id: true, name: true, avatarUrl: true } },
} as const;

export const commentsRepo = {
  listByPaper: (paperId: string) =>
    db.paperComment.findMany({
      where: { paperId },
      include: COMMENT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),

  create: (input: { paperId: string; userId: string; content: string }) =>
    db.paperComment.create({ data: input, include: COMMENT_INCLUDE }),

  deleteOwn: async (input: { commentId: string; userId: string }) => {
    const { count } = await db.paperComment.deleteMany({
      where: { id: input.commentId, userId: input.userId },
    });
    return count > 0;
  },
};

export type PaperCommentWithUser = Awaited<
  ReturnType<typeof commentsRepo.listByPaper>
>[number];

import { db } from '@/lib/db';

const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  avatarUrl: true,
  disabledAt: true,
} as const;

export const sessionsRepo = {
  create: (input: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    ipAddress: string | null;
    userAgent: string | null;
  }) => db.session.create({ data: input }),

  findCurrentByTokenHash: (tokenHash: string, now = new Date()) =>
    db.session.findFirst({
      where: {
        tokenHash,
        expiresAt: { gt: now },
      },
      select: {
        id: true,
        expiresAt: true,
        createdAt: true,
        lastSeenAt: true,
        ipAddress: true,
        userAgent: true,
        user: { select: publicUserSelect },
      },
    }),

  listForUser: (userId: string, now = new Date()) =>
    db.session.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        expiresAt: true,
        createdAt: true,
        lastSeenAt: true,
        ipAddress: true,
        userAgent: true,
      },
    }),

  touch: (id: string) =>
    db.session.update({
      where: { id },
      data: { lastSeenAt: new Date() },
    }),

  deleteByTokenHash: (tokenHash: string) =>
    db.session.deleteMany({
      where: { tokenHash },
    }),

  deleteForUser: (input: { userId: string; sessionId: string }) =>
    db.session.deleteMany({
      where: {
        id: input.sessionId,
        userId: input.userId,
      },
    }),
};

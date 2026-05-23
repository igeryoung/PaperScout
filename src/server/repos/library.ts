import { db } from '@/lib/db';
import type { Prisma, UserPaperStatus } from '@prisma/client';

const paperInclude = {
  evaluations: { orderBy: { createdAt: 'desc' } },
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
} as const satisfies Prisma.PaperInclude;

const userPaperInclude = {
  paper: { include: paperInclude },
} as const satisfies Prisma.UserPaperInclude;

export type LibraryUserPaper = Prisma.UserPaperGetPayload<{
  include: typeof userPaperInclude;
}>;

export type LibraryCollection = Prisma.PaperCollectionGetPayload<{
  include: { _count: { select: { items: true } } };
}>;

export type LibraryView = 'all' | 'liked' | 'history' | 'collection';

const DEFAULT_COLLECTION_NAME = '個人清單';

async function ensureDefaultCollection(userId: string) {
  const existing = await db.paperCollection.findFirst({
    where: { userId, isDefault: true },
    orderBy: { createdAt: 'asc' },
  });
  if (existing) return existing;

  const sameName = await db.paperCollection.findUnique({
    where: { userId_name: { userId, name: DEFAULT_COLLECTION_NAME } },
  });
  if (sameName) {
    return db.paperCollection.update({
      where: { id: sameName.id },
      data: { isDefault: true },
    });
  }

  return db.paperCollection.create({
    data: { userId, name: DEFAULT_COLLECTION_NAME, isDefault: true },
  });
}

async function collectionPaperIds(collectionId: string) {
  const items = await db.paperCollectionItem.findMany({
    where: { collectionId },
    select: { paperId: true },
  });
  return items.map((item) => item.paperId);
}

export const libraryRepo = {
  ensureDefaultCollection,

  listCollections: async (userId: string): Promise<LibraryCollection[]> => {
    await ensureDefaultCollection(userId);
    return db.paperCollection.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { items: true } } },
    });
  },

  stats: async (userId: string) => {
    const [total, liked, unread, notes, history] = await Promise.all([
      db.userPaper.count({ where: { userId } }),
      db.userPaper.count({ where: { userId, liked: true } }),
      db.userPaper.count({ where: { userId, status: 'UNREAD' } }),
      db.userPaper.count({
        where: { userId, AND: [{ note: { not: null } }, { note: { not: '' } }] },
      }),
      db.paperViewHistory.count({ where: { userId } }),
    ]);
    return { total, liked, unread, notes, history };
  },

  listEntries: async (input: {
    userId: string;
    view: LibraryView;
    collectionId?: string;
    limit?: number;
  }): Promise<LibraryUserPaper[]> => {
    const limit = input.limit ?? 60;
    if (input.view === 'collection' && input.collectionId) {
      const collection = await db.paperCollection.findFirst({
        where: { id: input.collectionId, userId: input.userId },
        select: { id: true },
      });
      if (!collection) return [];
      const paperIds = await collectionPaperIds(collection.id);
      if (paperIds.length === 0) return [];
      return db.userPaper.findMany({
        where: { userId: input.userId, paperId: { in: paperIds } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: limit,
        include: userPaperInclude,
      });
    }

    if (input.view === 'history') {
      const historyRows = await db.paperViewHistory.findMany({
        where: { userId: input.userId },
        orderBy: [{ viewedAt: 'desc' }, { id: 'desc' }],
        take: limit * 4,
        select: { paperId: true },
      });
      const seen = new Set<string>();
      const paperIds = historyRows
        .map((row) => row.paperId)
        .filter((paperId) => {
          if (seen.has(paperId)) return false;
          seen.add(paperId);
          return true;
        })
        .slice(0, limit);
      if (paperIds.length === 0) return [];

      const entries = await db.userPaper.findMany({
        where: { userId: input.userId, paperId: { in: paperIds } },
        include: userPaperInclude,
      });
      const byPaperId = new Map(entries.map((entry) => [entry.paperId, entry]));
      return paperIds.flatMap((paperId) => {
        const entry = byPaperId.get(paperId);
        return entry ? [entry] : [];
      });
    }

    return db.userPaper.findMany({
      where: {
        userId: input.userId,
        ...(input.view === 'liked' ? { liked: true } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: userPaperInclude,
    });
  },

  listAvailablePapers: async (input: {
    userId: string;
    collectionId?: string;
    limit?: number;
  }) => {
    const limit = input.limit ?? 12;
    const excludedIds = input.collectionId
      ? await collectionPaperIds(input.collectionId)
      : (
          await db.userPaper.findMany({
            where: { userId: input.userId },
            select: { paperId: true },
          })
        ).map((row) => row.paperId);

    return db.paper.findMany({
      where: excludedIds.length > 0 ? { id: { notIn: excludedIds } } : undefined,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        title: true,
        authors: true,
        primarySource: true,
        publishedDate: true,
        createdAt: true,
      },
    });
  },

  createCollection: async (input: {
    userId: string;
    name: string;
    description?: string | null;
  }) => {
    await ensureDefaultCollection(input.userId);
    return db.paperCollection.create({
      data: {
        userId: input.userId,
        name: input.name,
        description: input.description ?? null,
      },
    });
  },

  updateCollection: (input: {
    userId: string;
    collectionId: string;
    name?: string;
    description?: string | null;
  }) =>
    db.paperCollection.update({
      where: { id: input.collectionId, userId: input.userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    }),

  deleteCollection: async (input: { userId: string; collectionId: string }) => {
    const collection = await db.paperCollection.findFirst({
      where: { id: input.collectionId, userId: input.userId },
      select: { id: true, isDefault: true },
    });
    if (!collection) return { deleted: 0, defaultCollection: false };
    if (collection.isDefault) return { deleted: 0, defaultCollection: true };
    const result = await db.paperCollection.deleteMany({
      where: { id: input.collectionId, userId: input.userId },
    });
    return { deleted: result.count, defaultCollection: false };
  },

  addPaperToCollection: async (input: {
    userId: string;
    paperId: string;
    collectionId?: string | null;
  }) => {
    const collection = input.collectionId
      ? await db.paperCollection.findFirst({
          where: { id: input.collectionId, userId: input.userId },
        })
      : await ensureDefaultCollection(input.userId);
    if (!collection) return null;

    return db.$transaction(async (tx) => {
      await tx.userPaper.upsert({
        where: { userId_paperId: { userId: input.userId, paperId: input.paperId } },
        update: {},
        create: { userId: input.userId, paperId: input.paperId },
      });
      await tx.paperCollectionItem.upsert({
        where: {
          collectionId_paperId: {
            collectionId: collection.id,
            paperId: input.paperId,
          },
        },
        update: {},
        create: { collectionId: collection.id, paperId: input.paperId },
      });
      return collection;
    });
  },

  updatePaperState: async (input: {
    userId: string;
    paperId: string;
    liked?: boolean;
    status?: UserPaperStatus;
    note?: string | null;
  }) =>
    db.userPaper.upsert({
      where: { userId_paperId: { userId: input.userId, paperId: input.paperId } },
      update: {
        ...(input.liked !== undefined ? { liked: input.liked } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      create: {
        userId: input.userId,
        paperId: input.paperId,
        liked: input.liked ?? false,
        status: input.status ?? 'UNREAD',
        note: input.note ?? null,
      },
    }),

  removePaper: async (input: {
    userId: string;
    paperId: string;
    collectionId?: string | null;
  }) => {
    if (input.collectionId) {
      return db.paperCollectionItem.deleteMany({
        where: {
          paperId: input.paperId,
          collection: { id: input.collectionId, userId: input.userId },
        },
      });
    }

    await db.paperCollectionItem.deleteMany({
      where: {
        paperId: input.paperId,
        collection: { userId: input.userId },
      },
    });
    return db.userPaper.deleteMany({
      where: { userId: input.userId, paperId: input.paperId },
    });
  },

  recordView: async (input: { userId: string; paperId: string }) => {
    const now = new Date();
    await db.$transaction([
      db.userPaper.upsert({
        where: { userId_paperId: { userId: input.userId, paperId: input.paperId } },
        update: { lastViewedAt: now },
        create: {
          userId: input.userId,
          paperId: input.paperId,
          lastViewedAt: now,
        },
      }),
      db.paperViewHistory.create({
        data: { userId: input.userId, paperId: input.paperId, viewedAt: now },
      }),
    ]);
  },
};

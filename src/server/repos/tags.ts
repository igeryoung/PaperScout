import 'server-only';
import { db } from '@/lib/db';
import type { TagSource } from '@prisma/client';

export const tagsRepo = {
  addAll: async (paperId: string, tags: string[], source: TagSource) => {
    if (tags.length === 0) return;
    const norm = Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean)));
    await db.paperTag.createMany({
      data: norm.map((tag) => ({ paperId, tag, source })),
      skipDuplicates: true,
    });
  },

  listDistinct: async (limit = 100) => {
    const rows = await db.paperTag.groupBy({
      by: ['tag'],
      _count: { tag: true },
      orderBy: { _count: { tag: 'desc' } },
      take: limit,
    });
    return rows.map((r) => ({ tag: r.tag, count: r._count.tag }));
  },
};

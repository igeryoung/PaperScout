import 'server-only';
import { db } from '@/lib/db';
import type { Paper, Source } from '@prisma/client';

export const papersRepo = {
  findByFingerprint: (fp: string) =>
    db.paper.findUnique({ where: { duplicateFingerprint: fp } }),

  findById: (id: string) => db.paper.findUnique({ where: { id } }),

  findByNormalizedTitle: async (norm: string) => {
    const p = await db.paper.findFirst({ where: { normalizedTitle: norm } });
    if (!p) return null;
    return { id: p.id, title: p.title, authors: (p.authors as string[]) ?? [] };
  },

  findByPdfUrl: (pdfUrl: string) => db.paper.findFirst({ where: { pdfUrl } }),

  listRecentForFuzzy: async (limit = 500) => {
    const rows = await db.paper.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, normalizedTitle: true, title: true, authors: true },
    });
    return rows.map((r) => ({
      id: r.id,
      normalizedTitle: r.normalizedTitle,
      title: r.title,
      authors: (r.authors as string[]) ?? [],
    }));
  },

  create: (input: {
    title: string;
    normalizedTitle: string;
    authors: string[];
    abstract: string | null;
    venue: string | null;
    publishedDate: Date | null;
    pdfUrl: string | null;
    primarySource: Source;
    duplicateFingerprint: string;
  }): Promise<Paper> =>
    db.paper.create({
      data: {
        title: input.title,
        normalizedTitle: input.normalizedTitle,
        authors: input.authors,
        abstract: input.abstract,
        venue: input.venue,
        publishedDate: input.publishedDate,
        pdfUrl: input.pdfUrl,
        primarySource: input.primarySource,
        duplicateFingerprint: input.duplicateFingerprint,
      },
    }),
};

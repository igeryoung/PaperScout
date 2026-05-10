import { db } from '@/lib/db';
import type { Source } from '@prisma/client';

export const sourcesRepo = {
  findBySourcePaperId: async (source: 'ARXIV' | 'OPENREVIEW', id: string) => {
    const row = await db.paperSource.findFirst({
      where: { source: source as Source, sourcePaperId: id },
      select: { paperId: true },
    });
    return row;
  },

  findBySourceUrl: async (url: string) => {
    const row = await db.paperSource.findFirst({
      where: { sourceUrl: url },
      select: { paperId: true },
    });
    return row;
  },

  exists: async (paperId: string, source: Source) =>
    !!(await db.paperSource.findFirst({ where: { paperId, source }, select: { id: true } })),

  existsIdentity: async (input: {
    paperId: string;
    source: Source;
    sourcePaperId: string | null;
    sourceUrl: string;
  }) =>
    !!(await db.paperSource.findFirst({
      where: {
        paperId: input.paperId,
        source: input.source,
        OR: [
          ...(input.sourcePaperId ? [{ sourcePaperId: input.sourcePaperId }] : []),
          { sourceUrl: input.sourceUrl },
        ],
      },
      select: { id: true },
    })),

  create: (input: {
    paperId: string;
    source: Source;
    sourceUrl: string;
    sourcePaperId: string | null;
    pdfUrl: string | null;
    metadata?: unknown;
  }) =>
    db.paperSource.create({
      data: {
        paperId: input.paperId,
        source: input.source,
        sourceUrl: input.sourceUrl,
        sourcePaperId: input.sourcePaperId,
        pdfUrl: input.pdfUrl,
        metadata: (input.metadata ?? null) as never,
      },
    }),
};

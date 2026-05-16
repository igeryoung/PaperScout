import { db } from '@/lib/db';
import type { Paper, Prisma, Source } from '@prisma/client';

const detailInclude = {
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

export type PaperWithDetail = Prisma.PaperGetPayload<{
  include: typeof detailInclude;
}>;

export const papersRepo = {
  findByFingerprint: (fp: string) =>
    db.paper.findUnique({ where: { duplicateFingerprint: fp } }),

  findById: (id: string) => db.paper.findUnique({ where: { id } }),

  /**
   * Detail view for /papers/[id]. Returns the paper with all evaluations
   * (across runs, newest first), tags, sources, and code links.
   */
  findDetailById: (id: string): Promise<PaperWithDetail | null> =>
    db.paper.findUnique({ where: { id }, include: detailInclude }),

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

  /**
   * Read-only listing for the /library page. Cursor-by-id pagination
   * (Prisma `cursor` + `skip: 1`) so callers can page without reshaping
   * the result. Phase 1 caller does not paginate; Phase 4/5 will.
   */
  listLibrary: async (opts: { limit?: number; cursor?: string } = {}) => {
    const limit = opts.limit ?? 50;
    return db.paper.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
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

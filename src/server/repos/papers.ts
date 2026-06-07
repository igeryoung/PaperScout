import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import type { Paper, Source } from '@prisma/client';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { matchConferenceAcronym } from '@/lib/source-label';

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

export type PaperSort = 'newest' | 'oldest' | 'score';

export interface ListAllPapersOptions {
  q?: string;
  venue?: string;
  tag?: string;
  sort?: PaperSort;
  page?: number;
  pageSize?: number;
}

export interface ListAllPapersResult {
  papers: PaperWithDetail[];
  total: number;
  totalPages: number;
  page: number;
}

export interface ConferenceFacet {
  value: string;
  count: number;
}

export interface TagFacet {
  tag: string;
  count: number;
}

/** Compose the Prisma filter shared by every sort path of listAllPapers. */
function buildAllPapersWhere(opts: {
  q?: string;
  venue?: string;
  tag?: string;
  authorMatchIds?: string[];
}): Prisma.PaperWhereInput {
  const and: Prisma.PaperWhereInput[] = [];
  if (opts.venue) {
    and.push({ venue: { contains: opts.venue, mode: 'insensitive' } });
  }
  if (opts.tag) {
    and.push({ tags: { some: { tag: opts.tag } } });
  }
  if (opts.q) {
    const or: Prisma.PaperWhereInput[] = [
      { title: { contains: opts.q, mode: 'insensitive' } },
      { abstract: { contains: opts.q, mode: 'insensitive' } },
    ];
    // authors is a JSON array; substring matches are resolved out-of-band via
    // raw SQL (authors::text ILIKE) and folded back in as an id allow-list.
    if (opts.authorMatchIds && opts.authorMatchIds.length > 0) {
      or.push({ id: { in: opts.authorMatchIds } });
    }
    and.push({ OR: or });
  }
  return and.length > 0 ? { AND: and } : {};
}

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

  /**
   * Server-side paginated listing for the /papers browse page. Filters by free
   * text (title/abstract/authors), conference acronym, and tag. Date sorts page
   * directly in SQL; the score sort needs selectBestEvaluation() (app-side
   * stage priority, not a column) so it scans lightweight eval rows for the
   * filtered set, then loads full detail for the current page only.
   */
  listAllPapers: async (opts: ListAllPapersOptions = {}): Promise<ListAllPapersResult> => {
    const pageSize = opts.pageSize ?? 10;
    const requestedPage = Math.max(1, opts.page ?? 1);
    const q = opts.q?.trim() || undefined;
    const venue = opts.venue?.trim() || undefined;
    const tag = opts.tag?.trim() || undefined;
    const sort: PaperSort = opts.sort ?? 'newest';

    const authorMatchIds = q
      ? (
          await db.$queryRaw<{ id: string }[]>(
            Prisma.sql`SELECT id FROM papers WHERE authors::text ILIKE ${`%${q}%`}`,
          )
        ).map((row) => row.id)
      : undefined;

    const where = buildAllPapersWhere({ q, venue, tag, authorMatchIds });

    if (sort === 'score') {
      const rows = await db.paper.findMany({
        where,
        select: {
          id: true,
          publishedDate: true,
          evaluations: {
            select: {
              evaluationStage: true,
              pdfAnalysisStatus: true,
              totalScore: true,
            },
          },
        },
      });
      const scored = rows.map((row) => ({
        id: row.id,
        published: row.publishedDate,
        score: selectBestEvaluation(row.evaluations)?.totalScore ?? -1,
      }));
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const at = a.published?.getTime() ?? 0;
        const bt = b.published?.getTime() ?? 0;
        if (bt !== at) return bt - at;
        return a.id < b.id ? 1 : -1;
      });

      const total = scored.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);
      const pageIds = scored
        .slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
        .map((row) => row.id);

      const found = await db.paper.findMany({
        where: { id: { in: pageIds } },
        include: detailInclude,
      });
      const byId = new Map(found.map((paper) => [paper.id, paper]));
      const papers = pageIds
        .map((id) => byId.get(id))
        .filter((paper): paper is PaperWithDetail => Boolean(paper));

      return { papers, total, totalPages, page };
    }

    const total = await db.paper.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const orderBy: Prisma.PaperOrderByWithRelationInput[] =
      sort === 'oldest'
        ? [{ publishedDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
        : [{ publishedDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];

    const papers = await db.paper.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (page - 1) * pageSize,
      include: detailInclude,
    });

    return { papers, total, totalPages, page };
  },

  /** Conference-acronym facet (e.g. NEURIPS, CVPR) over papers that have a venue. */
  listConferenceFacets: async (): Promise<ConferenceFacet[]> => {
    const rows = await db.paper.findMany({
      where: { venue: { not: null } },
      select: { venue: true },
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const acronym = matchConferenceAcronym(row.venue);
      if (!acronym) continue;
      counts.set(acronym, (counts.get(acronym) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  },

  /** Most-used tags for the filter dropdown. */
  listTagFacets: async (limit = 30): Promise<TagFacet[]> => {
    const groups = await db.paperTag.groupBy({
      by: ['tag'],
      _count: { tag: true },
      orderBy: [{ _count: { tag: 'desc' } }, { tag: 'asc' }],
      take: limit,
    });
    return groups.map((group) => ({ tag: group.tag, count: group._count.tag }));
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

#!/usr/bin/env tsx
/**
 * Read/maintain the live Postgres papers for the Paper Factory "Live DB" tab.
 *
 * The factory (Python) shells out to this script the same way it does for
 * `ingest.ts`, so all DB access goes through Prisma and its relational logic
 * (cascading deletes, the dedup helpers) rather than raw SQL from Python.
 *
 * Subcommands (JSON on stdout, human errors on stderr + non-zero exit):
 *   list   [--q <text>] [--venue <v>] [--year <yyyy>]
 *          [--sort newest|oldest|score] [--page <n>] [--pageSize <n>]
 *   get    <paperId>                 full detail incl. the rendered figure PNG
 *   update <paperId> <patch.json>    patch core fields / tags / code links / eval / figure
 *   delete <paperId>                 delete the paper (cascade)
 *
 * Run via:  npm run --silent factory:db -- <subcommand> [...]
 */
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { normalizeTitle } from '@/server/dedup/normalize';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function out(value: unknown): void {
  process.stdout.write(JSON.stringify(value));
}

/** Parse `--flag value` pairs out of an argv slice. */
function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      flags[a.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return flags;
}

/** Reassemble the schema-shaped EvaluationRecord from the flat DB columns, so the
 *  factory's existing eval renderer (eval_render.py) can display it unchanged. */
function evalToRecord(e: {
  id: string;
  evaluationStage: string;
  noveltyScore: number;
  methodologicalRigorScore: number;
  experimentalQualityScore: number;
  venueSourceCredibilityScore: number;
  totalScore: number;
  summary: unknown;
  recommendationReason: unknown;
  strengths: unknown;
  weaknesses: unknown;
  recommendationDecision: string;
  pdfAnalysisStatus: string | null;
  digest: unknown;
}) {
  return {
    id: e.id,
    evaluationStage: e.evaluationStage,
    scores: {
      novelty: e.noveltyScore,
      methodologicalRigor: e.methodologicalRigorScore,
      experimentalQuality: e.experimentalQualityScore,
      venueSourceCredibility: e.venueSourceCredibilityScore,
      total: e.totalScore,
    },
    summary: e.summary,
    recommendationReason: e.recommendationReason,
    strengths: e.strengths,
    weaknesses: e.weaknesses,
    recommendationDecision: e.recommendationDecision,
    pdfAnalysisStatus: e.pdfAnalysisStatus,
    digest: e.digest,
  };
}

async function cmdList(argv: string[]): Promise<void> {
  const flags = parseFlags(argv);
  const q = flags.q?.trim() || undefined;
  const venue = flags.venue?.trim() || undefined;
  const year = flags.year?.trim() || undefined;
  const sort = (flags.sort as 'newest' | 'oldest' | 'score') || 'newest';
  const page = Math.max(1, parseInt(flags.page ?? '1', 10) || 1);
  const pageSize = Math.max(1, parseInt(flags.pageSize ?? '50', 10) || 50);

  const and: Prisma.PaperWhereInput[] = [];
  if (venue) and.push({ venue: { contains: venue, mode: 'insensitive' } });
  if (year) {
    and.push({
      publishedDate: {
        gte: new Date(`${year}-01-01T00:00:00Z`),
        lt: new Date(`${Number(year) + 1}-01-01T00:00:00Z`),
      },
    });
  }
  if (q) {
    const authorRows = await db.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT id FROM papers WHERE authors::text ILIKE ${`%${q}%`}`,
    );
    and.push({
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { abstract: { contains: q, mode: 'insensitive' } },
        { id: { in: authorRows.map((r) => r.id) } },
      ],
    });
  }
  const where: Prisma.PaperWhereInput = and.length ? { AND: and } : {};

  const total = await db.paper.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  // Score sort needs selectBestEvaluation (stage priority, not a column), so
  // pull the filtered id+score set and page in-app; date sorts page in SQL.
  let rows: Array<{
    id: string;
    title: string;
    authors: unknown;
    venue: string | null;
    publishedDate: Date | null;
    primarySource: string;
    evaluations: { evaluationStage: string; pdfAnalysisStatus: string | null; totalScore: number }[];
    sources: { source: string; sourcePaperId: string | null }[];
  }>;

  if (sort === 'score') {
    const scoring = await db.paper.findMany({
      where,
      select: {
        id: true,
        evaluations: { select: { evaluationStage: true, pdfAnalysisStatus: true, totalScore: true } },
      },
    });
    const scored = scoring
      .map((r) => ({ id: r.id, score: selectBestEvaluation(r.evaluations as never)?.totalScore ?? -1 }))
      .sort((a, b) => (b.score !== a.score ? b.score - a.score : a.id < b.id ? 1 : -1));
    const pageIds = scored
      .slice((safePage - 1) * pageSize, safePage * pageSize)
      .map((s) => s.id);
    const found = await db.paper.findMany({
      where: { id: { in: pageIds } },
      select: listSelect,
    });
    const byId = new Map(found.map((p) => [p.id, p]));
    rows = pageIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
  } else {
    const orderBy: Prisma.PaperOrderByWithRelationInput[] =
      sort === 'oldest'
        ? [{ publishedDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
        : [{ publishedDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
    rows = (await db.paper.findMany({
      where,
      orderBy,
      take: pageSize,
      skip: (safePage - 1) * pageSize,
      select: listSelect,
    })) as typeof rows;
  }

  const papers = rows.map((r) => {
    const authors = (r.authors as string[]) ?? [];
    return {
      id: r.id,
      title: r.title,
      authorsPreview: authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''),
      venue: r.venue,
      year: r.publishedDate ? new Date(r.publishedDate).getUTCFullYear() : null,
      primarySource: r.primarySource,
      totalScore: selectBestEvaluation(r.evaluations as never)?.totalScore ?? null,
      joinKeys: r.sources
        .filter((s) => s.sourcePaperId)
        .map((s) => ({ source: s.source, sourcePaperId: s.sourcePaperId })),
    };
  });

  out({ papers, total, totalPages, page: safePage });
}

const listSelect = {
  id: true,
  title: true,
  authors: true,
  venue: true,
  publishedDate: true,
  primarySource: true,
  evaluations: { select: { evaluationStage: true, pdfAnalysisStatus: true, totalScore: true } },
  sources: { select: { source: true, sourcePaperId: true } },
} satisfies Prisma.PaperSelect;

async function cmdGet(paperId: string): Promise<void> {
  const paper = await db.paper.findUnique({
    where: { id: paperId },
    include: {
      sources: true,
      tags: true,
      codeLinks: true,
      figure: true,
      evaluations: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!paper) fail(`no paper with id ${paperId}`);

  const best = selectBestEvaluation(paper.evaluations as never) as
    | (typeof paper.evaluations)[number]
    | null;

  // Render the figure bytes to a temp PNG the Qt panel can load directly.
  let figurePath: string | null = null;
  if (paper.figure?.imageBytes) {
    figurePath = join(tmpdir(), `factory-db-fig-${paperId}.png`);
    writeFileSync(figurePath, Buffer.from(paper.figure.imageBytes));
  }

  out({
    id: paper.id,
    title: paper.title,
    normalizedTitle: paper.normalizedTitle,
    authors: (paper.authors as string[]) ?? [],
    abstract: paper.abstract,
    venue: paper.venue,
    publishedDate: paper.publishedDate ? new Date(paper.publishedDate).toISOString().slice(0, 10) : null,
    pdfUrl: paper.pdfUrl,
    primarySource: paper.primarySource,
    createdAt: paper.createdAt,
    updatedAt: paper.updatedAt,
    joinKeys: paper.sources
      .filter((s) => s.sourcePaperId)
      .map((s) => ({ source: s.source, sourcePaperId: s.sourcePaperId })),
    tags: paper.tags.map((t) => ({ tag: t.tag, source: t.source })),
    codeLinks: paper.codeLinks.map((c) => c.codeUrl),
    figure: paper.figure
      ? {
          figureLabel: paper.figure.figureLabel,
          caption: paper.figure.caption,
          pageNumber: paper.figure.pageNumber,
        }
      : null,
    figurePath,
    evaluation: best ? evalToRecord(best) : null,
    evaluationCount: paper.evaluations.length,
  });
}

async function cmdUpdate(paperId: string, patchPath: string): Promise<void> {
  const { readFileSync } = await import('node:fs');
  const patch = JSON.parse(readFileSync(patchPath, 'utf8')) as {
    paper?: Record<string, unknown>;
    tags?: { set: string[] };
    codeLinks?: { set: string[] };
    evaluation?: { id: string } & Record<string, unknown>;
    figure?: { figureLabel?: string | null; caption?: unknown; pageNumber?: number | null };
  };

  const existing = await db.paper.findUnique({ where: { id: paperId }, select: { id: true } });
  if (!existing) fail(`no paper with id ${paperId}`);

  await db.$transaction(async (tx) => {
    if (patch.paper && Object.keys(patch.paper).length) {
      const data: Prisma.PaperUpdateInput = {};
      const p = patch.paper;
      if ('title' in p) {
        data.title = String(p.title);
        // Keep normalizedTitle in sync; duplicateFingerprint stays stable to
        // avoid colliding with the table's unique constraint.
        data.normalizedTitle = normalizeTitle(String(p.title));
      }
      if ('abstract' in p) data.abstract = (p.abstract as string) || null;
      if ('venue' in p) data.venue = (p.venue as string) || null;
      if ('pdfUrl' in p) data.pdfUrl = (p.pdfUrl as string) || null;
      if ('authors' in p) data.authors = p.authors as Prisma.InputJsonValue;
      if ('publishedDate' in p) {
        const v = p.publishedDate as string | null;
        data.publishedDate = v ? new Date(`${v}T00:00:00Z`) : null;
      }
      await tx.paper.update({ where: { id: paperId }, data });
    }

    if (patch.tags) {
      const tags = Array.from(
        new Set(patch.tags.set.map((t) => t.trim().toLowerCase()).filter(Boolean)),
      );
      await tx.paperTag.deleteMany({ where: { paperId } });
      if (tags.length) {
        await tx.paperTag.createMany({
          data: tags.map((tag) => ({ paperId, tag, source: 'USER_GENERATED' as const })),
          skipDuplicates: true,
        });
      }
    }

    if (patch.codeLinks) {
      const urls = Array.from(
        new Set(patch.codeLinks.set.map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u))),
      );
      await tx.paperCodeLink.deleteMany({ where: { paperId } });
      if (urls.length) {
        await tx.paperCodeLink.createMany({
          data: urls.map((codeUrl) => ({ paperId, codeUrl })),
          skipDuplicates: true,
        });
      }
    }

    if (patch.evaluation) {
      const e = patch.evaluation;
      const data: Prisma.PaperEvaluationUpdateInput = {};
      if (e.scores) {
        const s = e.scores as Record<string, number>;
        data.noveltyScore = s.novelty;
        data.methodologicalRigorScore = s.methodologicalRigor;
        data.experimentalQualityScore = s.experimentalQuality;
        data.venueSourceCredibilityScore = s.venueSourceCredibility;
        data.totalScore = s.total;
      }
      for (const k of ['summary', 'recommendationReason', 'strengths', 'weaknesses', 'digest'] as const) {
        if (k in e) (data as Record<string, unknown>)[k] = e[k] ?? null;
      }
      if ('recommendationDecision' in e) {
        data.recommendationDecision = e.recommendationDecision as never;
      }
      await tx.paperEvaluation.update({ where: { id: e.id }, data });
    }

    if (patch.figure) {
      const f = patch.figure;
      const data: Prisma.PaperFigureUpdateInput = {};
      if ('figureLabel' in f) data.figureLabel = f.figureLabel ?? null;
      if ('caption' in f) data.caption = (f.caption as Prisma.InputJsonValue) ?? Prisma.JsonNull;
      if ('pageNumber' in f) data.pageNumber = f.pageNumber ?? null;
      await tx.paperFigure.update({ where: { paperId }, data });
    }
  });

  out({ updated: paperId });
}

async function cmdDelete(paperId: string): Promise<void> {
  const existing = await db.paper.findUnique({
    where: { id: paperId },
    select: { id: true, title: true },
  });
  if (!existing) fail(`no paper with id ${paperId}`);
  await db.paper.delete({ where: { id: paperId } });
  out({ deleted: paperId, title: existing.title });
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case 'list':
      await cmdList(rest);
      break;
    case 'get':
      if (!rest[0]) fail('usage: get <paperId>');
      await cmdGet(rest[0]);
      break;
    case 'update':
      if (!rest[0] || !rest[1]) fail('usage: update <paperId> <patch.json>');
      await cmdUpdate(rest[0], rest[1]);
      break;
    case 'delete':
      if (!rest[0]) fail('usage: delete <paperId>');
      await cmdDelete(rest[0]);
      break;
    default:
      fail(`unknown subcommand: ${cmd ?? '(none)'} — use list|get|update|delete`);
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => db.$disconnect());

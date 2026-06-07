// View-model aggregates for the Phase 4 trend dashboard.
// All Prisma calls live here so pages stay free of joins.

import { unstable_cache } from 'next/cache';
import { db } from '@/lib/db';
import type {
  EvaluationStage,
  PdfAnalysisStatus,
  Source,
} from '@prisma/client';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { formatConferenceLabel, matchConferenceAcronym } from '@/lib/source-label';

type SummaryEvalRow = {
  paperId: string;
  evaluationStage: EvaluationStage;
  totalScore: number;
  pdfAnalysisStatus: PdfAnalysisStatus | null;
};

export interface SourceCount {
  key: string;
  source: Source;
  label: string | null;
  count: number;
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface ScoreStats {
  min: number;
  median: number;
  max: number;
}

export interface PdfStatusCounts {
  success: number;
  failed: number;
  unavailable: number;
  none: number; // ABSTRACT_SCREENING-only papers
}

export interface RunSummary {
  totalPapers: number;
  recommendedCount: number;
  sources: SourceCount[];
  topTags: TagCount[];
  scoreStats: ScoreStats | null;
  pdfStatus: PdfStatusCounts;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

type SourceRow = { source: Source; paper: { venue: string | null } };

/** Tally PaperSource rows into a sorted SourceCount[] (OPENREVIEW split by venue). */
function tallySources(rows: SourceRow[]): SourceCount[] {
  const sourceCounts = new Map<string, SourceCount>();
  for (const row of rows) {
    const label =
      row.source === 'OPENREVIEW' && row.paper.venue?.trim()
        ? formatConferenceLabel(row.paper.venue)
        : null;
    const key = label ? `${row.source}:${label}` : row.source;
    const existing = sourceCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      sourceCounts.set(key, { key, source: row.source, label, count: 1 });
    }
  }
  return [...sourceCounts.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.key.localeCompare(b.key);
  });
}

/** Cache tag for the database-wide source distribution; revalidate on ingest. */
export const SOURCE_DISTRIBUTION_TAG = 'source-distribution';

// Statistic over EVERY paper in the database, not a single run. Restricted to
// top-conference papers (venue resolves to a tracked acronym) and counted ONE
// per paper. Cached so it is computed once and reused across reloads instead of
// recalculated each request.
const getCachedSourceDistribution = unstable_cache(
  async (): Promise<SourceCount[]> => {
    const papers = await db.paper.findMany({
      select: { primarySource: true, venue: true },
    });
    const counts = new Map<string, SourceCount>();
    for (const p of papers) {
      const acronym = matchConferenceAcronym(p.venue);
      if (!acronym) continue; // top conferences only
      const existing = counts.get(acronym);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(acronym, {
          key: acronym,
          source: p.primarySource,
          label: acronym,
          count: 1,
        });
      }
    }
    return [...counts.values()].sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.key.localeCompare(b.key);
    });
  },
  ['source-distribution'],
  { tags: [SOURCE_DISTRIBUTION_TAG], revalidate: 3600 },
);

function bestEvalPerPaper(evals: SummaryEvalRow[]): Map<string, SummaryEvalRow> {
  const byPaper = new Map<string, SummaryEvalRow[]>();
  for (const e of evals) {
    const arr = byPaper.get(e.paperId) ?? [];
    arr.push(e);
    byPaper.set(e.paperId, arr);
  }
  const best = new Map<string, SummaryEvalRow>();
  for (const [paperId, list] of byPaper) {
    const picked = selectBestEvaluation(list);
    if (picked) best.set(paperId, picked);
  }
  return best;
}

export const trendsRepo = {
  /** Database-wide source distribution (all papers), cached across reloads. */
  getSourceDistribution: (): Promise<SourceCount[]> => getCachedSourceDistribution(),
  getRunSummary: async (runId: string): Promise<RunSummary> => {
    const results = await db.paperRunResult.findMany({
      where: { runId },
      select: { paperId: true, isRecommended: true },
    });
    const paperIds = results.map((r) => r.paperId);
    const totalPapers = results.length;
    const recommendedCount = results.filter((r) => r.isRecommended).length;

    if (paperIds.length === 0) {
      return {
        totalPapers: 0,
        recommendedCount: 0,
        sources: [],
        topTags: [],
        scoreStats: null,
        pdfStatus: { success: 0, failed: 0, unavailable: 0, none: 0 },
      };
    }

    const [sourceRows, tagGroups, evals] = await Promise.all([
      db.paperSource.findMany({
        where: { paperId: { in: paperIds } },
        select: {
          source: true,
          paper: { select: { venue: true } },
        },
      }),
      db.paperTag.groupBy({
        by: ['tag'],
        where: { paperId: { in: paperIds } },
        _count: { tag: true },
        orderBy: [{ _count: { tag: 'desc' } }, { tag: 'asc' }],
        take: 10,
      }),
      db.paperEvaluation.findMany({
        where: { runId },
        select: {
          paperId: true,
          evaluationStage: true,
          totalScore: true,
          pdfAnalysisStatus: true,
        },
      }),
    ]);

    const sources = tallySources(sourceRows);

    const topTags: TagCount[] = tagGroups.map((g) => ({
      tag: g.tag,
      count: g._count.tag,
    }));

    const best = bestEvalPerPaper(evals);
    const scores = [...best.values()].map((e) => e.totalScore);
    const scoreStats: ScoreStats | null =
      scores.length > 0
        ? {
            min: Math.min(...scores),
            median: median(scores),
            max: Math.max(...scores),
          }
        : null;

    const pdfStatus: PdfStatusCounts = {
      success: 0,
      failed: 0,
      unavailable: 0,
      none: 0,
    };
    for (const e of best.values()) {
      if (e.evaluationStage === 'ABSTRACT_SCREENING') {
        pdfStatus.none += 1;
        continue;
      }
      const s: PdfAnalysisStatus | null = e.pdfAnalysisStatus;
      if (s === 'SUCCESS') pdfStatus.success += 1;
      else if (s === 'FAILED') pdfStatus.failed += 1;
      else if (s === 'UNAVAILABLE') pdfStatus.unavailable += 1;
      else pdfStatus.none += 1;
    }

    return {
      totalPapers,
      recommendedCount,
      sources,
      topTags,
      scoreStats,
      pdfStatus,
    };
  },
};

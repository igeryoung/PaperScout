// View-model aggregates for the Phase 4 trend dashboard.
// All Prisma calls live here so pages stay free of joins.

import { db } from '@/lib/db';
import type {
  EvaluationStage,
  PdfAnalysisStatus,
  Source,
} from '@prisma/client';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';

type SummaryEvalRow = {
  paperId: string;
  evaluationStage: EvaluationStage;
  totalScore: number;
  pdfAnalysisStatus: PdfAnalysisStatus | null;
};

export interface SourceCount {
  source: Source;
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

    const [sourceGroups, tagGroups, evals] = await Promise.all([
      db.paperSource.groupBy({
        by: ['source'],
        where: { paperId: { in: paperIds } },
        _count: { source: true },
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

    const sources: SourceCount[] = sourceGroups
      .map((g) => ({ source: g.source, count: g._count.source }))
      .sort((a, b) => b.count - a.count);

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

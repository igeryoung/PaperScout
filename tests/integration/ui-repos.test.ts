// Integration tests for the Phase 4 view-model repo helpers against a real
// Postgres test schema. Mirrors the gating pattern of tests/integration/ingest.test.ts.

import './setup';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SHOULD_RUN_INTEGRATION, setupTestDb, cleanupTestDb } from './setup';

const REPO_ROOT = resolve(__dirname, '../..');
const INGEST_SCRIPT = join(REPO_ROOT, 'scripts/ingest.ts');
const REFERENCE_DIR = join(
  REPO_ROOT,
  'scripts/prompt-eval/reference/raw/2026-05-10-2142',
);
const SAMPLE_DIR = join(REPO_ROOT, 'data/sample');

function copyRunDir(src: string): string {
  const dst = mkdtempSync(join(tmpdir(), 'pcs-ui-repos-'));
  cpSync(join(src, 'candidates.json'), join(dst, 'candidates.json'));
  cpSync(join(src, 'evaluations.json'), join(dst, 'evaluations.json'));
  if (existsSync(join(src, 'figures'))) {
    cpSync(join(src, 'figures'), join(dst, 'figures'), { recursive: true });
  }
  return dst;
}

function runIngest(dir: string): void {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST };
  execFileSync('npx', ['tsx', INGEST_SCRIPT, dir], {
    cwd: REPO_ROOT,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe.skipIf(!SHOULD_RUN_INTEGRATION)('ui-repos integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
  });

  it('trendsRepo.getRunSummary returns counts + sources + tags + score stats', async () => {
    runIngest(copyRunDir(REFERENCE_DIR));

    const { db } = await import('@/lib/db');
    const { trendsRepo } = await import('@/server/repos/trends');
    const run = await db.dailyRun.findFirstOrThrow();

    const summary = await trendsRepo.getRunSummary(run.id);

    expect(summary.totalPapers).toBe(5);
    expect(summary.recommendedCount).toBe(3);

    // Reference run is all-arXiv.
    expect(summary.sources.length).toBeGreaterThanOrEqual(1);
    const arxiv = summary.sources.find((s) => s.source === 'ARXIV');
    expect(arxiv?.count).toBe(5);

    // F5 (UNAVAILABLE) + 4 SUCCESS.
    expect(summary.pdfStatus.success).toBe(4);
    expect(summary.pdfStatus.unavailable).toBe(1);
    expect(summary.pdfStatus.failed).toBe(0);
    expect(summary.pdfStatus.none).toBe(0);

    // Frozen scores: 86, 73, 71, 61, 30 → median 71, min 30, max 86.
    expect(summary.scoreStats).not.toBeNull();
    expect(summary.scoreStats?.max).toBe(86);
    expect(summary.scoreStats?.min).toBe(30);
    expect(summary.scoreStats?.median).toBe(71);

    // Top tags should be non-empty and sorted desc.
    expect(summary.topTags.length).toBeGreaterThan(0);
    for (let i = 1; i < summary.topTags.length; i += 1) {
      expect(summary.topTags[i - 1].count).toBeGreaterThanOrEqual(summary.topTags[i].count);
    }
  }, 90_000);

  it('runResultsRepo.findByRunWithDetail returns ranked rows with joined relations', async () => {
    runIngest(copyRunDir(REFERENCE_DIR));

    const { db } = await import('@/lib/db');
    const { runResultsRepo } = await import('@/server/repos/runResults');
    const run = await db.dailyRun.findFirstOrThrow();

    const recommended = await runResultsRepo.findByRunWithDetail(run.id, {
      recommendedOnly: true,
    });
    expect(recommended.length).toBe(3);
    expect(recommended.map((r) => r.finalRank)).toEqual([1, 2, 3]);
    for (const r of recommended) {
      expect(r.paper.evaluations.length).toBeGreaterThan(0);
      expect(r.paper.sources.length).toBeGreaterThan(0);
      expect(r.isRecommended).toBe(true);
    }

    const all = await runResultsRepo.findByRunWithDetail(run.id, {
      recommendedOnly: false,
    });
    expect(all.length).toBe(5);
    expect(all.map((r) => r.finalRank)).toEqual([1, 2, 3, 4, 5]);
  }, 90_000);

  it('papersRepo.findDetailById returns paper with all evaluations and relations', async () => {
    runIngest(copyRunDir(REFERENCE_DIR));

    const { db } = await import('@/lib/db');
    const { papersRepo } = await import('@/server/repos/papers');
    const top = await db.paperRunResult.findFirstOrThrow({
      where: { finalRank: 1 },
    });

    const paper = await papersRepo.findDetailById(top.paperId);
    expect(paper).not.toBeNull();
    expect(paper?.id).toBe(top.paperId);
    expect(paper?.evaluations.length).toBeGreaterThanOrEqual(1);
    expect(paper?.sources.length).toBeGreaterThanOrEqual(1);
    expect(paper?.tags.length).toBeGreaterThanOrEqual(0);
  }, 90_000);

  it('findDetailById returns null for unknown paper id', async () => {
    const { papersRepo } = await import('@/server/repos/papers');
    const result = await papersRepo.findDetailById(
      '00000000-0000-0000-0000-000000000000',
    );
    expect(result).toBeNull();
  });

  it('findByRunWithDetail + findDetailById expose figure metadata but NOT imageBytes', async () => {
    // Sample run has figure blocks for both papers, with PNG fixtures under
    // data/sample/figures/. The ingest copies them into paper_figures.
    runIngest(copyRunDir(SAMPLE_DIR));

    const { db } = await import('@/lib/db');
    const { papersRepo } = await import('@/server/repos/papers');
    const { runResultsRepo } = await import('@/server/repos/runResults');
    const run = await db.dailyRun.findFirstOrThrow();

    const results = await runResultsRepo.findByRunWithDetail(run.id, {
      recommendedOnly: false,
    });
    expect(results.length).toBe(2);

    const withFigure = results.filter((r) => r.paper.figure !== null);
    const withoutFigure = results.filter((r) => r.paper.figure === null);
    expect(withFigure.length).toBe(2);
    expect(withoutFigure.length).toBe(0);

    for (const r of withFigure) {
      const fig = r.paper.figure!;
      expect(fig.figureLabel).toMatch(/^Figure \d+$/);
      expect(fig.pageNumber).toBeGreaterThan(0);
      const caption = fig.caption as { en?: string; 'zh-TW'?: string } | null;
      expect(caption?.en?.length ?? 0).toBeGreaterThan(0);
      expect(caption?.['zh-TW']?.length ?? 0).toBeGreaterThan(0);
      expect(fig.mimeType).toBe('image/png');
      // imageBytes is intentionally excluded from list queries — keys present
      // on the metadata-only select must NOT include `imageBytes`.
      expect(Object.keys(fig)).not.toContain('imageBytes');
    }

    // Same shape on the detail repo.
    const detail = await papersRepo.findDetailById(withFigure[0].paperId);
    expect(detail?.figure).not.toBeNull();
    expect(Object.keys(detail!.figure!)).not.toContain('imageBytes');
  }, 90_000);
});

// Integration test for the collect → persist pipeline. Runs against a real
// Postgres test schema (paperscout_test). Skipped unless RUN_INTEGRATION=1 and
// DATABASE_URL_TEST are both set.

import './setup';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Candidate } from '@/server/schema/candidate';
import { SHOULD_RUN_INTEGRATION, setupTestDb, cleanupTestDb } from './setup';

vi.mock('@/server/sources', () => ({
  collectFromAllSources: vi.fn(),
}));

function mkCandidate(overrides: Partial<Candidate>): Candidate {
  return {
    title: 'Untitled',
    authors: ['Anon'],
    abstract: null,
    venue: null,
    publishedDate: '2026-05-09',
    sourceUrl: 'https://arxiv.org/abs/0000.0000',
    pdfUrl: null,
    sourcePaperId: '0000.0000',
    source: 'ARXIV',
    codeUrls: [],
    additionalSources: [],
    ...overrides,
  };
}

// 30 distinct title nouns so adjacent papers don't pass the fuzzy-title threshold (0.92).
const TITLE_NOUNS = [
  'Diffusion', 'Transformer', 'Segmentation', 'Detection', 'Tracking',
  'Reconstruction', 'Rendering', 'Pose', 'Depth', 'Scene',
  'Field', 'Mesh', 'Volume', 'Camera', 'Motion',
  'Object', 'Pixel', 'Voxel', 'Frame', 'Sequence',
  'Sprite', 'Texture', 'Material', 'Lighting', 'Shadow',
  'Surface', 'Boundary', 'Region', 'Vertex', 'Edge',
];

function mkBatch(prefix: string, count: number): Candidate[] {
  return Array.from({ length: count }, (_, i) => {
    const id = `${prefix}-${String(i).padStart(3, '0')}`;
    const noun1 = TITLE_NOUNS[i % TITLE_NOUNS.length];
    const noun2 = TITLE_NOUNS[(i * 7 + 3) % TITLE_NOUNS.length];
    return mkCandidate({
      // Distinct nouns + the unique id ensure title sim < 0.92 across rows.
      title: `${noun1} aware ${noun2} learning ${id}`,
      // Each row's authors are fully unique — no overlap with any other row.
      authors: [`Author ${id} Alpha`, `Author ${id} Beta`],
      sourcePaperId: id,
      sourceUrl: `https://arxiv.org/abs/${id}`,
      pdfUrl: `https://arxiv.org/pdf/${id}`,
      source: 'ARXIV',
    });
  });
}

describe.skipIf(!SHOULD_RUN_INTEGRATION)('collect → persist integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  it('persists three runs with cross-run dedup and run-level COMPLETED status', async () => {
    const sources = await import('@/server/sources');
    const collectMock = sources.collectFromAllSources as unknown as ReturnType<typeof vi.fn>;
    const { runCollectionInBackground, startRun } = await import('@/server/pipeline/runner');
    const { db } = await import('@/lib/db');

    // Batch A: 30 fresh papers.
    const batchA = mkBatch('A', 30);
    // Batch B: 10 dupes from A (same arxiv ids) + 20 fresh.
    const batchB = [...batchA.slice(0, 10), ...mkBatch('B', 20)];
    // Batch C: 5 fuzzy dupes (same normalized title, different arxiv id) + 25 fresh.
    const fuzzyDupes = batchA.slice(10, 15).map((c) =>
      mkCandidate({
        title: c.title, // identical normalized title → normalized_title match
        authors: c.authors,
        sourcePaperId: `C-fuzz-${c.sourcePaperId}`,
        sourceUrl: `https://arxiv.org/abs/C-fuzz-${c.sourcePaperId}`,
        pdfUrl: null,
      }),
    );
    const batchC = [...fuzzyDupes, ...mkBatch('C', 25)];

    collectMock.mockResolvedValueOnce(batchA);
    collectMock.mockResolvedValueOnce(batchB);
    collectMock.mockResolvedValueOnce(batchC);

    const runA = await startRun();
    await runCollectionInBackground(runA.id);
    const runB = await startRun();
    await runCollectionInBackground(runB.id);
    const runC = await startRun();
    await runCollectionInBackground(runC.id);

    // All three runs should be COMPLETED.
    const runs = await db.dailyRun.findMany({ orderBy: { createdAt: 'asc' } });
    expect(runs.length).toBe(3);
    for (const r of runs) {
      expect(r.status).toBe('COMPLETED');
      expect(r.completedAt).not.toBeNull();
    }

    // 30 fresh + 0 (all dupes) + 25 fresh + 5 (fuzzy match treated as existing) = 55
    // But: persist treats fuzzy matches as EXISTING and doesn't create a new Paper.
    // So distinct papers = 30 (A) + 20 (B's fresh half) + 25 (C's fresh) = 75.
    const papers = await db.paper.findMany();
    expect(papers.length).toBe(75);

    // Run results: each run records exactly batchSize entries, deduped only on within-run paperId
    // (which doesn't collide here; cross-run dupes still produce one runResults row per run).
    const resultsA = await db.paperRunResult.findMany({ where: { runId: runA.id } });
    const resultsB = await db.paperRunResult.findMany({ where: { runId: runB.id } });
    const resultsC = await db.paperRunResult.findMany({ where: { runId: runC.id } });
    expect(resultsA.length).toBe(30);
    expect(resultsB.length).toBe(30);
    expect(resultsC.length).toBe(30);

    // Run B: 10 of its 30 candidates are dupes against A → those 10 should be EXISTING.
    const existingB = resultsB.filter((r) => r.collectionStatus === 'EXISTING').length;
    expect(existingB).toBe(10);

    // Run C: 5 are fuzzy/normalized-title matches against A → EXISTING.
    const existingC = resultsC.filter((r) => r.collectionStatus === 'EXISTING').length;
    expect(existingC).toBe(5);

    // paper_duplicates: only fuzzy / normalized_title matches add rows.
    const dupes = await db.paperDuplicate.findMany();
    expect(dupes.length).toBeGreaterThanOrEqual(5);
    for (const d of dupes) {
      expect(['FUZZY_TITLE', 'NORMALIZED_TITLE']).toContain(d.matchMethod);
    }

    // duplicate_fingerprint must remain unique across all papers.
    const fps = new Set(papers.map((p) => p.duplicateFingerprint));
    expect(fps.size).toBe(papers.length);
  }, 60_000);
});

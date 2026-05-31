// Integration tests for scripts/ingest.ts against a real Postgres test schema.
// Skipped unless RUN_INTEGRATION=1 and DATABASE_URL_TEST are both set.

import './setup';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { SHOULD_RUN_INTEGRATION, setupTestDb, cleanupTestDb } from './setup';

const REPO_ROOT = resolve(__dirname, '../..');
const INGEST_SCRIPT = join(REPO_ROOT, 'scripts/ingest.ts');
const SAMPLE_DIR = join(REPO_ROOT, 'data/sample');
const REFERENCE_DIR = join(
  REPO_ROOT,
  'scripts/prompt-eval/reference/raw/2026-05-10-2142',
);

function copyRunDir(src: string): string {
  const dst = mkdtempSync(join(tmpdir(), 'pcs-ingest-'));
  cpSync(join(src, 'candidates.json'), join(dst, 'candidates.json'));
  cpSync(join(src, 'evaluations.json'), join(dst, 'evaluations.json'));
  // Figures are referenced from evaluations.json by `figure.renderedPath`
  // (relative to the run dir); copy the whole directory if present so the
  // ingest step can read the PNG bytes.
  if (existsSync(join(src, 'figures'))) {
    cpSync(join(src, 'figures'), join(dst, 'figures'), { recursive: true });
  }
  return dst;
}

function runIngest(dir: string, force = false): { stdout: string; stderr: string; status: number } {
  const env = { ...process.env, DATABASE_URL: process.env.DATABASE_URL_TEST };
  try {
    const stdout = execFileSync(
      'npx',
      ['tsx', INGEST_SCRIPT, dir, ...(force ? ['--force'] : [])],
      { cwd: REPO_ROOT, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { stdout, stderr: '', status: 0 };
  } catch (e) {
    const err = e as { status?: number; stdout?: string; stderr?: string };
    return { stdout: err.stdout ?? '', stderr: err.stderr ?? '', status: err.status ?? 1 };
  }
}

describe.skipIf(!SHOULD_RUN_INTEGRATION)('ingest integration', () => {
  beforeAll(async () => {
    await setupTestDb();
  });

  afterAll(async () => {
    await cleanupTestDb();
  });

  beforeEach(async () => {
    await setupTestDb();
  });

  it('sample run: 2 papers, ranks 1..2, 2 recommended (matches RECOMMEND decisions)', async () => {
    const dir = copyRunDir(SAMPLE_DIR);
    const r = runIngest(dir);
    expect(r.status, r.stderr).toBe(0);

    const { db } = await import('@/lib/db');
    const papers = await db.paper.findMany();
    expect(papers.length).toBe(2);

    const evals = await db.paperEvaluation.findMany();
    expect(evals.length).toBe(2);

    const results = await db.paperRunResult.findMany({ orderBy: { finalRank: 'asc' } });
    expect(results.map((r) => r.finalRank)).toEqual([1, 2]);
    expect(results.every((r) => r.finalRank !== null)).toBe(true);
    expect(results.filter((r) => r.isRecommended).length).toBe(2);
  }, 60_000);

  it('sample run: PaperFigure rows are populated from <run-dir>/figures/*.png', async () => {
    const dir = copyRunDir(SAMPLE_DIR);
    const r = runIngest(dir);
    expect(r.status, r.stderr).toBe(0);

    const { db } = await import('@/lib/db');
    // Sample evaluations.json carries `figure` blocks for the two FULL_PDF entries.
    const figures = await db.paperFigure.findMany({ orderBy: { figureLabel: 'asc' } });
    expect(figures.length).toBe(2);

    for (const fig of figures) {
      expect(fig.mimeType).toBe('image/png');
      expect(fig.imageBytes.length).toBeGreaterThan(0);
      expect(fig.figureLabel).toMatch(/^Figure \d+$/);
      expect(fig.pageNumber).toBeGreaterThan(0);
      const caption = fig.caption as { en?: string; 'zh-TW'?: string } | null;
      expect(caption?.en?.length ?? 0).toBeGreaterThan(0);
      expect(caption?.['zh-TW']?.length ?? 0).toBeGreaterThan(0);
    }

    // The current sample carries one highlighted figure for each paper.
    expect(figures[0].figureLabel).toBe('Figure 1');
    expect(figures[0].pageNumber).toBe(2);
    expect(figures[1].figureLabel).toBe('Figure 1');
    expect(figures[1].pageNumber).toBe(2);

    // Final ingest summary mentions the figure counts.
    expect(r.stdout).toMatch(/figures: 2 ok/);
  }, 60_000);

  it('idempotency: second ingest of same dir fails, --force re-ingests cleanly', async () => {
    const dir = copyRunDir(SAMPLE_DIR);
    expect(runIngest(dir).status).toBe(0);

    const second = runIngest(dir);
    expect(second.status).not.toBe(0);
    expect(second.stderr).toMatch(/already ingested/);

    const forced = runIngest(dir, true);
    expect(forced.status, forced.stderr).toBe(0);

    const { db } = await import('@/lib/db');
    const runs = await db.dailyRun.findMany();
    expect(runs.length).toBe(1);
    const results = await db.paperRunResult.findMany({ orderBy: { finalRank: 'asc' } });
    expect(results.map((r) => r.finalRank)).toEqual([1, 2]);
  }, 90_000);

  it('Phase 2.5 reference run: F1>F3>F4>F2>F5, 3 recommended, F5 keeps UNAVAILABLE', async () => {
    const dir = copyRunDir(REFERENCE_DIR);
    const r = runIngest(dir);
    expect(r.status, r.stderr).toBe(0);

    const { db } = await import('@/lib/db');
    const papers = await db.paper.findMany();
    expect(papers.length).toBe(5);

    const evals = await db.paperEvaluation.findMany();
    expect(evals.length).toBe(5);

    const results = await db.paperRunResult.findMany({
      include: { paper: true },
      orderBy: { finalRank: 'asc' },
    });
    expect(results.map((r) => r.finalRank)).toEqual([1, 2, 3, 4, 5]);

    // Map evaluations by arXiv id via paperSource → paper join.
    const sources = await db.paperSource.findMany({ where: { source: 'ARXIV' } });
    const paperIdByArxiv = new Map<string, string>();
    for (const s of sources) {
      if (s.sourcePaperId) paperIdByArxiv.set(s.sourcePaperId, s.paperId);
    }

    const expectations: Array<{
      arxiv: string;
      rank: number;
      totalScore: number;
      decision: string;
      pdfStatus: string | null;
    }> = [
      { arxiv: '2304.02643', rank: 1, totalScore: 86, decision: 'RECOMMEND', pdfStatus: 'SUCCESS' },
      { arxiv: '2302.05442', rank: 2, totalScore: 73, decision: 'RECOMMEND', pdfStatus: 'SUCCESS' },
      { arxiv: '2304.07743', rank: 3, totalScore: 71, decision: 'RECOMMEND', pdfStatus: 'SUCCESS' },
      { arxiv: '2212.08059', rank: 4, totalScore: 61, decision: 'STORE_ONLY', pdfStatus: 'SUCCESS' },
      { arxiv: '2309.17421', rank: 5, totalScore: 30, decision: 'LOW_QUALITY', pdfStatus: 'UNAVAILABLE' },
    ];

    for (const exp of expectations) {
      const paperId = paperIdByArxiv.get(exp.arxiv);
      expect(paperId, `no paperId for ${exp.arxiv}`).toBeDefined();
      const result = results.find((r) => r.paperId === paperId);
      expect(result?.finalRank, `rank for ${exp.arxiv}`).toBe(exp.rank);
      const evaluation = evals.find((e) => e.paperId === paperId);
      expect(evaluation?.totalScore, `score for ${exp.arxiv}`).toBe(exp.totalScore);
      expect(evaluation?.recommendationDecision, `decision for ${exp.arxiv}`).toBe(exp.decision);
      expect(evaluation?.pdfAnalysisStatus, `pdfStatus for ${exp.arxiv}`).toBe(exp.pdfStatus);
    }

    // 3 recommended: F1, F3, F4 (the RECOMMEND-decision papers within top-5).
    const recommended = results.filter((r) => r.isRecommended);
    expect(recommended.length).toBe(3);
    const recommendedArxivIds = new Set(
      recommended
        .map((r) => [...paperIdByArxiv.entries()].find(([, pid]) => pid === r.paperId)?.[0])
        .filter((x): x is string => !!x),
    );
    expect(recommendedArxivIds).toEqual(new Set(['2304.02643', '2302.05442', '2304.07743']));

    // Coarse Phase 2.5 flags.
    const f1Id = paperIdByArxiv.get('2304.02643')!;
    const f5Id = paperIdByArxiv.get('2309.17421')!;
    const f4Id = paperIdByArxiv.get('2304.07743')!;
    const top2 = results.slice(0, 2).map((r) => r.paperId);
    const bottom2 = results.slice(-2).map((r) => r.paperId);
    expect(top2).toContain(f1Id);
    expect(bottom2).toContain(f5Id);
    expect(results[results.length - 1].paperId).not.toBe(f4Id);
  }, 90_000);

  it('alternate-source joinKey resolves to the primary paper', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pcs-altsrc-'));
    const candidates = [
      {
        title: 'Alt-source primary paper',
        authors: ['Alice', 'Bob'],
        abstract: 'placeholder',
        venue: null,
        publishedDate: '2026-05-09',
        sourceUrl: 'https://arxiv.org/abs/9999.0001',
        pdfUrl: 'https://arxiv.org/pdf/9999.0001',
        sourcePaperId: '9999.0001',
        source: 'ARXIV',
        codeUrls: [],
        additionalSources: [
          {
            source: 'HUGGINGFACE',
            sourceUrl: 'https://huggingface.co/papers/9999.0001',
            sourcePaperId: 'hf-9999-0001',
          },
        ],
      },
    ];
    // Evaluation joinKey points at the HUGGINGFACE alt, not the ARXIV primary.
    const evaluations = [
      {
        joinKey: { source: 'HUGGINGFACE', sourcePaperId: 'hf-9999-0001' },
        evaluationStage: 'ABSTRACT_SCREENING',
        scores: {
          novelty: 15,
          methodologicalRigor: 15,
          experimentalQuality: 12,
          venueSourceCredibility: 10,
          authorInstitutionReputation: 10,
          total: 62,
        },
        summary: { en: 's', 'zh-TW': 's' },
        recommendationReason: { en: 'r', 'zh-TW': 'r' },
        keyContribution: null,
        methodologySummary: null,
        strengths: null,
        weaknesses: null,
        tags: ['x'],
        rankingExplanation: { en: 'e', 'zh-TW': 'e' },
        recommendationDecision: 'RECOMMEND',
        pdfAnalysisStatus: null,
        tableFigureAnalysis: null,
      },
    ];
    writeFileSync(join(tmp, 'candidates.json'), JSON.stringify(candidates));
    writeFileSync(join(tmp, 'evaluations.json'), JSON.stringify(evaluations));

    const r = runIngest(tmp);
    expect(r.status, r.stderr).toBe(0);

    const { db } = await import('@/lib/db');
    const papers = await db.paper.findMany();
    expect(papers.length).toBe(1);
    const evals = await db.paperEvaluation.findMany();
    expect(evals.length).toBe(1);
    expect(evals[0].paperId).toBe(papers[0].id);
    // Both source rows attached to the same paper.
    const sources = await db.paperSource.findMany({ where: { paperId: papers[0].id } });
    expect(sources.length).toBe(2);
  }, 60_000);

  it('within-run fuzzy collision: second candidate is skipped, no constraint violation', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pcs-fuzzy-'));
    const sharedTitle = 'Fuzzy collision study for diffusion models in segmentation';
    const candidates = [
      {
        title: sharedTitle,
        authors: ['Alice Original', 'Bob Original'],
        abstract: 'a',
        venue: null,
        publishedDate: '2026-05-09',
        sourceUrl: 'https://arxiv.org/abs/9991.0001',
        pdfUrl: 'https://arxiv.org/pdf/9991.0001',
        sourcePaperId: '9991.0001',
        source: 'ARXIV',
        codeUrls: [],
        additionalSources: [],
      },
      {
        // Same normalized title → matches via NORMALIZED_TITLE.
        title: sharedTitle,
        authors: ['Alice Original', 'Bob Original'],
        abstract: 'b',
        venue: null,
        publishedDate: '2026-05-09',
        sourceUrl: 'https://arxiv.org/abs/9991.0002',
        pdfUrl: 'https://arxiv.org/pdf/9991.0002',
        sourcePaperId: '9991.0002',
        source: 'ARXIV',
        codeUrls: [],
        additionalSources: [],
      },
    ];
    const evaluations = [
      {
        joinKey: { source: 'ARXIV', sourcePaperId: '9991.0001' },
        evaluationStage: 'ABSTRACT_SCREENING',
        scores: {
          novelty: 10,
          methodologicalRigor: 10,
          experimentalQuality: 10,
          venueSourceCredibility: 10,
          authorInstitutionReputation: 10,
          total: 50,
        },
        summary: { en: 's', 'zh-TW': 's' },
        recommendationReason: { en: 'r', 'zh-TW': 'r' },
        keyContribution: null,
        methodologySummary: null,
        strengths: null,
        weaknesses: null,
        tags: [],
        rankingExplanation: { en: 'e', 'zh-TW': 'e' },
        recommendationDecision: 'STORE_ONLY',
        pdfAnalysisStatus: null,
        tableFigureAnalysis: null,
      },
    ];
    writeFileSync(join(tmp, 'candidates.json'), JSON.stringify(candidates));
    writeFileSync(join(tmp, 'evaluations.json'), JSON.stringify(evaluations));

    const r = runIngest(tmp);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/1 skipped/);

    const { db } = await import('@/lib/db');
    const runs = await db.dailyRun.findMany();
    const results = await db.paperRunResult.findMany({ where: { runId: runs[0].id } });
    expect(results.length).toBe(1);
  }, 60_000);

  it('fail-fast: candidate without matching evaluation aborts with a clear message', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'pcs-missing-eval-'));
    const candidatesRaw = JSON.parse(readFileSync(join(SAMPLE_DIR, 'candidates.json'), 'utf8'));
    const evaluationsRaw = JSON.parse(readFileSync(join(SAMPLE_DIR, 'evaluations.json'), 'utf8'));
    // Drop the evaluation for the last candidate.
    const lastCand = candidatesRaw[candidatesRaw.length - 1];
    const filtered = evaluationsRaw.filter(
      (e: { joinKey: { source: string; sourcePaperId: string } }) =>
        !(e.joinKey.source === lastCand.source && e.joinKey.sourcePaperId === lastCand.sourcePaperId),
    );
    writeFileSync(join(tmp, 'candidates.json'), JSON.stringify(candidatesRaw));
    writeFileSync(join(tmp, 'evaluations.json'), JSON.stringify(filtered));

    const r = runIngest(tmp);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/no matching evaluation/);
  }, 60_000);
});

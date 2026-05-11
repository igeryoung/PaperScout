// Pure helpers for the Phase 2.5 prompt harness.
// All public functions take raw `unknown` so a single malformed evaluation
// record cannot blank the diagnostic report.

import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import {
  CandidateSchema,
  CandidatesFileSchema,
  type Candidate,
} from '../../src/server/schema/candidate';
import {
  EvaluationSchema,
  EvaluationStageEnum,
  PdfAnalysisStatusEnum,
  RecommendationDecisionEnum,
} from '../../src/server/schema/evaluation';

// ---------- Score dimension keys ----------

export const DIMENSION_KEYS = [
  'novelty',
  'methodologicalRigor',
  'experimentalQuality',
  'venueSourceCredibility',
  'authorInstitutionReputation',
] as const;
export type DimensionKey = (typeof DIMENSION_KEYS)[number];

const BoundedScoreKey = z.enum([...DIMENSION_KEYS, 'total']);

// ---------- BoundsSchema ----------

const NumericRange = z
  .object({ min: z.number().optional(), max: z.number().optional() })
  .strict()
  .refine((v) => v.min !== undefined || v.max !== undefined, {
    message: 'must specify at least one of min or max',
  });

export const BoundsSchema = z
  .object({
    scores: z.partialRecord(BoundedScoreKey, NumericRange).optional(),
    recommendationDecision: z
      .object({ in: z.array(RecommendationDecisionEnum).min(1) })
      .strict()
      .optional(),
    evaluationStage: z
      .object({ in: z.array(EvaluationStageEnum).min(1) })
      .strict()
      .optional(),
    pdfAnalysisStatus: z
      .object({ in: z.array(PdfAnalysisStatusEnum.nullable()).min(1) })
      .strict()
      .optional(),
  })
  .strict();
export type Bounds = z.infer<typeof BoundsSchema>;

// ---------- FixtureManifestSchema ----------

export const FixtureIdSchema = z.string().regex(/^F[1-9][0-9]*$/);
export type FixtureId = z.infer<typeof FixtureIdSchema>;

const ManifestEntrySchema = z
  .object({
    fixtureId: FixtureIdSchema,
    primaryKey: z.string().min(3),
    allJoinKeys: z.array(z.string().min(3)).min(1),
    metadataPath: z.string().min(1),
    boundsPath: z.string().min(1),
  })
  .strict();
export const FixtureManifestSchema = z.array(ManifestEntrySchema);
export type FixtureManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type FixtureManifest = z.infer<typeof FixtureManifestSchema>;

// ---------- Fixture loading ----------

export interface LoadedFixture {
  fixtureId: FixtureId;
  metadata: Candidate;
  bounds: Bounds;
  metadataPath: string;
  boundsPath: string;
}

export function loadFixtures(fixturesDir: string): LoadedFixture[] {
  const entries = readdirSync(fixturesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^F[1-9][0-9]*$/.test(e.name))
    .map((e) => e.name)
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  if (entries.length === 0) {
    throw new Error(`No fixture directories matching F<n> found in ${fixturesDir}`);
  }

  return entries.map((fixtureId) => {
    const metadataPath = join(fixturesDir, fixtureId, 'metadata.json');
    const boundsPath = join(fixturesDir, fixtureId, 'bounds.json');

    const metaRaw = JSON.parse(readFileSync(metadataPath, 'utf8'));
    // The `_fixture` block lives only in fixture metadata — drop before parsing
    // against the canonical CandidateSchema.
    const { _fixture, ...candidateLike } = metaRaw as Record<string, unknown>;
    void _fixture;
    const metadata = CandidateSchema.parse(candidateLike);

    const boundsRaw = JSON.parse(readFileSync(boundsPath, 'utf8'));
    const bounds = BoundsSchema.parse(boundsRaw);

    return { fixtureId: fixtureId as FixtureId, metadata, bounds, metadataPath, boundsPath };
  });
}

export function buildManifest(
  fixtures: LoadedFixture[],
  repoRoot: string,
): FixtureManifest {
  return fixtures.map((f) => {
    const primaryKey = `${f.metadata.source}:${f.metadata.sourcePaperId}`;
    const allJoinKeys = [
      primaryKey,
      ...f.metadata.additionalSources.map((alt) => `${alt.source}:${alt.sourcePaperId}`),
    ];
    return {
      fixtureId: f.fixtureId,
      primaryKey,
      allJoinKeys,
      metadataPath: relative(repoRoot, f.metadataPath),
      boundsPath: relative(repoRoot, f.boundsPath),
    };
  });
}

// ---------- Candidate map (mirrors scripts/ingest.ts:65-79) ----------

export function buildCandidateMap(candidates: Candidate[]): Map<string, Candidate> {
  const map = new Map<string, Candidate>();
  for (const c of candidates) {
    if (!c.sourcePaperId) continue;
    map.set(`${c.source}:${c.sourcePaperId}`, c);
    for (const alt of c.additionalSources) {
      map.set(`${alt.source}:${alt.sourcePaperId}`, c);
    }
  }
  return map;
}

// ---------- Defensive raw-JSON readers ----------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export interface ResolvedJoinKey {
  key: string | null;
  candidate: Candidate | null;
}

export function resolveJoinKey(
  rawEvaluation: unknown,
  candidateMap: Map<string, Candidate>,
): ResolvedJoinKey {
  if (!isRecord(rawEvaluation)) return { key: null, candidate: null };
  const jk = rawEvaluation.joinKey;
  if (!isRecord(jk)) return { key: null, candidate: null };
  const source = typeof jk.source === 'string' ? jk.source : null;
  const id = typeof jk.sourcePaperId === 'string' ? jk.sourcePaperId : null;
  if (!source || !id) return { key: null, candidate: null };
  const key = `${source}:${id}`;
  return { key, candidate: candidateMap.get(key) ?? null };
}

export interface TotalCheck {
  computed: number | null;
  reported: number | null;
  mismatch: boolean;
}

export function recomputeTotal(rawScores: unknown): TotalCheck {
  if (!isRecord(rawScores)) return { computed: null, reported: null, mismatch: false };
  const dims = DIMENSION_KEYS.map((k) => rawScores[k]);
  if (dims.some((d) => typeof d !== 'number')) {
    return {
      computed: null,
      reported: typeof rawScores.total === 'number' ? rawScores.total : null,
      mismatch: false,
    };
  }
  const computed = (dims as number[]).reduce((a, b) => a + b, 0);
  const reported = typeof rawScores.total === 'number' ? rawScores.total : null;
  return { computed, reported, mismatch: reported !== null && reported !== computed };
}

// ---------- Bounds application ----------

export interface BoundsResult {
  passed: boolean;
  failedChecks: string[];
}

export function applyBounds(rawEvaluation: unknown, bounds: Bounds): BoundsResult {
  const failedChecks: string[] = [];
  if (!isRecord(rawEvaluation)) {
    return { passed: false, failedChecks: ['evaluation is not an object'] };
  }

  if (bounds.scores) {
    const scores = isRecord(rawEvaluation.scores) ? rawEvaluation.scores : null;
    for (const [dimRaw, range] of Object.entries(bounds.scores)) {
      const dim = dimRaw as DimensionKey | 'total';
      const v = scores ? scores[dim] : undefined;
      if (typeof v !== 'number') {
        failedChecks.push(`scores.${dim} missing or not a number`);
        continue;
      }
      if (range && typeof range.min === 'number' && v < range.min) {
        failedChecks.push(`scores.${dim} < ${range.min} (got ${v})`);
      }
      if (range && typeof range.max === 'number' && v > range.max) {
        failedChecks.push(`scores.${dim} > ${range.max} (got ${v})`);
      }
    }
  }

  if (bounds.recommendationDecision) {
    const v = rawEvaluation.recommendationDecision;
    if (!bounds.recommendationDecision.in.includes(v as never)) {
      failedChecks.push(
        `recommendationDecision not in [${bounds.recommendationDecision.in.join(', ')}] (got ${String(v)})`,
      );
    }
  }
  if (bounds.evaluationStage) {
    const v = rawEvaluation.evaluationStage;
    if (!bounds.evaluationStage.in.includes(v as never)) {
      failedChecks.push(
        `evaluationStage not in [${bounds.evaluationStage.in.join(', ')}] (got ${String(v)})`,
      );
    }
  }
  if (bounds.pdfAnalysisStatus) {
    const v = rawEvaluation.pdfAnalysisStatus ?? null;
    if (!bounds.pdfAnalysisStatus.in.includes(v as never)) {
      failedChecks.push(
        `pdfAnalysisStatus not in [${bounds.pdfAnalysisStatus.in.map((x) => x ?? 'null').join(', ')}] (got ${String(v)})`,
      );
    }
  }

  return { passed: failedChecks.length === 0, failedChecks };
}

// ---------- Per-record schema check ----------

export interface SchemaCheck {
  valid: boolean;
  errors: { path: string; message: string }[];
}

export function checkRecordSchema(rawEvaluation: unknown): SchemaCheck {
  const result = EvaluationSchema.safeParse(rawEvaluation);
  if (result.success) return { valid: true, errors: [] };
  return {
    valid: false,
    errors: result.error.issues.map((i) => ({
      path: i.path.join('.') || '(root)',
      message: i.message,
    })),
  };
}

// ---------- Summary / ranking ----------

export interface PerRecordReport {
  fixtureId: FixtureId | null;
  joinKey: string | null;
  schema: SchemaCheck;
  total: TotalCheck;
  bounds: BoundsResult | null; // null when no fixture matched
  scores: Partial<Record<DimensionKey | 'total', number>>;
  recommendationDecision: string | null;
  evaluationStage: string | null;
  pdfAnalysisStatus: string | null;
}

export interface ReportSummary {
  records: PerRecordReport[];
  unmatchedJoinKeys: string[];
  fixtureCoverage: FixtureCoverage;
  schemaValidCount: number;
  boundsPassedCount: number;
  totalMismatchCount: number;
  rankingByTotal: { fixtureId: FixtureId | null; joinKey: string | null; total: number }[];
  coarseFlags: { f1InTop2: boolean; f5InBottom2: boolean; f4NotLast: boolean };
}

export interface FixtureCoverage {
  expectedFixtureIds: FixtureId[];
  missingFixtureIds: FixtureId[];
  duplicateFixtureIds: FixtureId[];
  unexpectedJoinKeys: string[];
  complete: boolean;
}

export function analyzeFixtureCoverage(
  records: Pick<PerRecordReport, 'fixtureId' | 'joinKey'>[],
  manifest: FixtureManifest,
): FixtureCoverage {
  const expectedFixtureIds = manifest.map((m) => m.fixtureId);
  const counts = new Map<FixtureId, number>();
  for (const id of expectedFixtureIds) counts.set(id, 0);

  const unexpectedJoinKeys: string[] = [];
  for (const r of records) {
    if (r.fixtureId) {
      counts.set(r.fixtureId, (counts.get(r.fixtureId) ?? 0) + 1);
    } else {
      unexpectedJoinKeys.push(r.joinKey ?? '(missing or malformed joinKey)');
    }
  }

  const missingFixtureIds = expectedFixtureIds.filter((id) => counts.get(id) === 0);
  const duplicateFixtureIds = expectedFixtureIds.filter((id) => (counts.get(id) ?? 0) > 1);

  return {
    expectedFixtureIds,
    missingFixtureIds,
    duplicateFixtureIds,
    unexpectedJoinKeys,
    complete:
      missingFixtureIds.length === 0 &&
      duplicateFixtureIds.length === 0 &&
      unexpectedJoinKeys.length === 0,
  };
}

function readScores(raw: unknown): PerRecordReport['scores'] {
  const out: PerRecordReport['scores'] = {};
  if (!isRecord(raw)) return out;
  const s = raw.scores;
  if (!isRecord(s)) return out;
  for (const k of [...DIMENSION_KEYS, 'total'] as const) {
    if (typeof s[k] === 'number') out[k] = s[k] as number;
  }
  return out;
}

function readEnum(raw: unknown, key: string): string | null {
  if (!isRecord(raw)) return null;
  const v = raw[key];
  return typeof v === 'string' ? v : v === null ? 'null' : null;
}

export function summarize(
  rawEvaluations: unknown[],
  candidateMap: Map<string, Candidate>,
  manifest: FixtureManifest,
  boundsByFixture: Map<FixtureId, Bounds>,
): ReportSummary {
  const fixtureByJoinKey = new Map<string, FixtureId>();
  for (const m of manifest) {
    for (const k of m.allJoinKeys) fixtureByJoinKey.set(k, m.fixtureId);
  }

  const records: PerRecordReport[] = [];
  const unmatchedJoinKeys: string[] = [];

  for (const raw of rawEvaluations) {
    const resolved = resolveJoinKey(raw, candidateMap);
    const fixtureId = resolved.key ? (fixtureByJoinKey.get(resolved.key) ?? null) : null;
    if (resolved.key && !candidateMap.has(resolved.key)) {
      unmatchedJoinKeys.push(resolved.key);
    } else if (!resolved.key) {
      unmatchedJoinKeys.push('(missing or malformed joinKey)');
    }

    const schema = checkRecordSchema(raw);
    const total = recomputeTotal(isRecord(raw) ? raw.scores : null);
    const fixtureBounds = fixtureId ? boundsByFixture.get(fixtureId) : undefined;
    const bounds = fixtureBounds ? applyBounds(raw, fixtureBounds) : null;
    const scores = readScores(raw);

    records.push({
      fixtureId,
      joinKey: resolved.key,
      schema,
      total,
      bounds,
      scores,
      recommendationDecision: readEnum(raw, 'recommendationDecision'),
      evaluationStage: readEnum(raw, 'evaluationStage'),
      pdfAnalysisStatus: readEnum(raw, 'pdfAnalysisStatus'),
    });
  }

  const schemaValidCount = records.filter((r) => r.schema.valid).length;
  const boundsPassedCount = records.filter((r) => r.bounds?.passed === true).length;
  const totalMismatchCount = records.filter((r) => r.total.mismatch).length;
  const fixtureCoverage = analyzeFixtureCoverage(records, manifest);

  const rankingByTotal = [...records]
    .map((r) => ({
      fixtureId: r.fixtureId,
      joinKey: r.joinKey,
      total: r.scores.total ?? r.total.computed ?? -1,
    }))
    .sort((a, b) => b.total - a.total);

  const order = rankingByTotal.map((r) => r.fixtureId);
  const idx = (id: FixtureId) => order.indexOf(id);
  const f1InTop2 = idx('F1' as FixtureId) >= 0 && idx('F1' as FixtureId) < 2;
  const f5InBottom2 =
    idx('F5' as FixtureId) >= 0 && idx('F5' as FixtureId) >= order.length - 2;
  const f4Idx = idx('F4' as FixtureId);
  const f4NotLast = f4Idx >= 0 && f4Idx < order.length - 1;

  return {
    records,
    unmatchedJoinKeys,
    fixtureCoverage,
    schemaValidCount,
    boundsPassedCount,
    totalMismatchCount,
    rankingByTotal,
    coarseFlags: { f1InTop2, f5InBottom2, f4NotLast },
  };
}

// ---------- File loaders for CLI ----------

export function loadCandidatesFile(path: string): Candidate[] {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return CandidatesFileSchema.parse(raw);
}

export function loadEvaluationsFileRaw(path: string): unknown[] {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(raw)) {
    throw new Error(`${path}: top-level JSON must be an array`);
  }
  return raw;
}

export function loadManifest(path: string): FixtureManifest {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  return FixtureManifestSchema.parse(raw);
}

export function loadBoundsForManifest(
  manifest: FixtureManifest,
  repoRoot: string,
): Map<FixtureId, Bounds> {
  const map = new Map<FixtureId, Bounds>();
  for (const m of manifest) {
    const raw = JSON.parse(readFileSync(join(repoRoot, m.boundsPath), 'utf8'));
    map.set(m.fixtureId, BoundsSchema.parse(raw));
  }
  return map;
}

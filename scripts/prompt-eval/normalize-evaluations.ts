#!/usr/bin/env tsx
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  analyzeFixtureCoverage,
  DIMENSION_KEYS,
  loadManifest,
  type FixtureId,
  type PerRecordReport,
} from './lib';

const REPO_ROOT = resolve(__dirname, '..', '..');
const REFERENCE_DIR = resolve(__dirname, 'reference', 'normalized');

const KEY_ORDER = [
  'joinKey',
  'evaluationStage',
  'scores',
  'recommendationDecision',
  'recommendationReason',
  'rankingExplanation',
  'summary',
  'pdfAnalysisStatus',
  'keyContribution',
  'methodologySummary',
  'strengths',
  'weaknesses',
  'tableFigureAnalysis',
  'tags',
] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function reorderRecord(raw: unknown): Record<string, unknown> {
  if (!isRecord(raw)) return raw as never;
  const out: Record<string, unknown> = {};
  for (const k of KEY_ORDER) {
    if (k in raw) out[k] = raw[k];
  }
  for (const k of Object.keys(raw)) {
    if (!(k in out)) out[k] = raw[k];
  }
  if (isRecord(out.scores)) {
    const s = out.scores as Record<string, unknown>;
    let computed = 0;
    let allNumeric = true;
    for (const dim of DIMENSION_KEYS) {
      if (typeof s[dim] !== 'number') {
        allNumeric = false;
        break;
      }
      computed += s[dim] as number;
    }
    const reorderedScores: Record<string, unknown> = {};
    for (const dim of DIMENSION_KEYS) reorderedScores[dim] = s[dim];
    reorderedScores.total = allNumeric ? computed : s.total;
    out.scores = reorderedScores;
  }
  return out;
}

function joinKeyOf(raw: unknown): string | null {
  if (!isRecord(raw)) return null;
  const jk = raw.joinKey;
  if (!isRecord(jk)) return null;
  const source = typeof jk.source === 'string' ? jk.source : null;
  const id = typeof jk.sourcePaperId === 'string' ? jk.sourcePaperId : null;
  return source && id ? `${source}:${id}` : null;
}

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx scripts/prompt-eval/normalize-evaluations.ts <run-dir>');
    process.exit(2);
  }
  const runDir = resolve(arg);
  const evalPath = join(runDir, 'evaluations.json');
  const manifestPath = join(runDir, 'fixtures-manifest.json');
  for (const p of [evalPath, manifestPath]) {
    if (!existsSync(p)) {
      console.error(`Missing file: ${p}`);
      process.exit(1);
    }
  }

  const evaluations = JSON.parse(readFileSync(evalPath, 'utf8'));
  if (!Array.isArray(evaluations)) {
    console.error(`${evalPath}: top-level JSON must be an array`);
    process.exit(1);
  }
  const manifest = loadManifest(manifestPath);

  const fixtureByJoinKey = new Map<string, FixtureId>();
  for (const m of manifest) {
    for (const k of m.allJoinKeys) fixtureByJoinKey.set(k, m.fixtureId);
  }

  mkdirSync(REFERENCE_DIR, { recursive: true });

  const matched = evaluations.map((raw) => {
    const k = joinKeyOf(raw);
    const fixtureId = k ? fixtureByJoinKey.get(k) : null;
    return { raw, joinKey: k, fixtureId: fixtureId ?? null };
  });
  const coverage = analyzeFixtureCoverage(
    matched.map(
      (m): Pick<PerRecordReport, 'fixtureId' | 'joinKey'> => ({
        fixtureId: m.fixtureId,
        joinKey: m.joinKey,
      }),
    ),
    manifest,
  );
  if (!coverage.complete) {
    console.error('Cannot normalize incomplete fixture coverage:');
    console.error(`  missing:    ${coverage.missingFixtureIds.join(', ') || '(none)'}`);
    console.error(`  duplicates: ${coverage.duplicateFixtureIds.join(', ') || '(none)'}`);
    console.error(`  unexpected: ${coverage.unexpectedJoinKeys.join(', ') || '(none)'}`);
    process.exit(1);
  }

  for (const m of manifest) {
    const outPath = join(REFERENCE_DIR, `${m.fixtureId}.json`);
    if (existsSync(outPath)) unlinkSync(outPath);
  }

  const written: string[] = [];
  for (const match of matched) {
    const fixtureId = match.fixtureId;
    if (!fixtureId) {
      console.warn(`skipping evaluation with no fixture match: joinKey=${match.joinKey}`);
      continue;
    }
    const normalized = reorderRecord(match.raw);
    const outPath = join(REFERENCE_DIR, `${fixtureId}.json`);
    writeFileSync(outPath, JSON.stringify(normalized, null, 2) + '\n');
    written.push(outPath);
  }

  for (const p of written) {
    const rel = p.startsWith(REPO_ROOT + '/') ? p.slice(REPO_ROOT.length + 1) : p;
    console.log(`wrote ${rel}`);
  }
  console.log(`\nTotal: ${written.length} normalized files written.`);
}

main();

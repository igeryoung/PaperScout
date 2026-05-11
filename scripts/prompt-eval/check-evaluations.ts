#!/usr/bin/env tsx
import { existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  buildCandidateMap,
  loadBoundsForManifest,
  loadCandidatesFile,
  loadEvaluationsFileRaw,
  loadManifest,
  summarize,
} from './lib';

const REPO_ROOT = resolve(__dirname, '..', '..');

function main(): void {
  const arg = process.argv[2];
  if (!arg) {
    console.error('Usage: tsx scripts/prompt-eval/check-evaluations.ts <run-dir>');
    process.exit(2);
  }

  const runDir = resolve(arg);
  const candidatesPath = join(runDir, 'candidates.json');
  const manifestPath = join(runDir, 'fixtures-manifest.json');
  const evaluationsPath = join(runDir, 'evaluations.json');

  for (const p of [candidatesPath, manifestPath, evaluationsPath]) {
    if (!existsSync(p)) {
      console.error(`Missing file: ${p}`);
      process.exit(1);
    }
  }

  const candidates = loadCandidatesFile(candidatesPath);
  const manifest = loadManifest(manifestPath);
  const boundsByFixture = loadBoundsForManifest(manifest, REPO_ROOT);
  const evaluationsRaw = loadEvaluationsFileRaw(evaluationsPath);

  const candidateMap = buildCandidateMap(candidates);
  const summary = summarize(evaluationsRaw, candidateMap, manifest, boundsByFixture);

  // ---- Schema validity table ----
  console.log('\n--- Schema validity ---');
  console.log('fixtureId  joinKey                        valid  first-error');
  for (const r of summary.records) {
    const id = (r.fixtureId ?? '?').padEnd(9);
    const key = (r.joinKey ?? '(none)').padEnd(30);
    const ok = r.schema.valid ? 'YES  ' : 'NO   ';
    const err = r.schema.valid ? '' : `${r.schema.errors[0]?.path}: ${r.schema.errors[0]?.message}`;
    console.log(`${id}  ${key} ${ok} ${err}`);
  }

  // ---- Score table ----
  console.log('\n--- Scores ---');
  console.log('fixtureId  nov rig exp ven aut total  decision      stage              pdf');
  for (const r of summary.records) {
    const id = (r.fixtureId ?? '?').padEnd(9);
    const s = r.scores;
    const fmt = (n: number | undefined, w: number) => String(n ?? '-').padStart(w);
    const decision = (r.recommendationDecision ?? '-').padEnd(13);
    const stage = (r.evaluationStage ?? '-').padEnd(18);
    const pdf = r.pdfAnalysisStatus ?? '-';
    console.log(
      `${id}  ${fmt(s.novelty, 3)} ${fmt(s.methodologicalRigor, 3)} ${fmt(s.experimentalQuality, 3)} ${fmt(s.venueSourceCredibility, 3)} ${fmt(s.authorInstitutionReputation, 3)} ${fmt(s.total, 5)}  ${decision} ${stage} ${pdf}`,
    );
  }

  // ---- Total mismatches ----
  if (summary.totalMismatchCount > 0) {
    console.log('\n--- Total-sum mismatches ---');
    for (const r of summary.records) {
      if (r.total.mismatch) {
        console.log(
          `${r.fixtureId ?? '?'}  reported=${r.total.reported}  computed=${r.total.computed}`,
        );
      }
    }
  }

  // ---- Unmatched joinKeys ----
  if (summary.unmatchedJoinKeys.length > 0) {
    console.log('\n--- Unmatched joinKeys ---');
    for (const k of summary.unmatchedJoinKeys) console.log(`  ${k}`);
  }

  // ---- Fixture coverage ----
  console.log('\n--- Fixture coverage ---');
  console.log(`expected:   ${summary.fixtureCoverage.expectedFixtureIds.join(', ')}`);
  console.log(
    `missing:    ${summary.fixtureCoverage.missingFixtureIds.join(', ') || '(none)'}`,
  );
  console.log(
    `duplicates: ${summary.fixtureCoverage.duplicateFixtureIds.join(', ') || '(none)'}`,
  );
  console.log(
    `unexpected: ${summary.fixtureCoverage.unexpectedJoinKeys.join(', ') || '(none)'}`,
  );

  // ---- Bounds ----
  console.log('\n--- Soft bounds ---');
  console.log('fixtureId  passed  failed-checks');
  for (const r of summary.records) {
    const id = (r.fixtureId ?? '?').padEnd(9);
    const passed = r.bounds ? (r.bounds.passed ? 'YES   ' : 'NO    ') : 'N/A   ';
    const fails = r.bounds ? r.bounds.failedChecks.join('; ') : 'no fixture match';
    console.log(`${id}  ${passed}  ${fails}`);
  }

  // ---- Ranking ----
  console.log('\n--- Ranking by total ---');
  console.log(
    'expected (prior): F1 > F4 > F3 > F5 > F2  (informational, not gating)',
  );
  console.log('actual:');
  for (const r of summary.rankingByTotal) {
    console.log(`  ${r.fixtureId ?? '?'}  total=${r.total}  ${r.joinKey ?? '(no key)'}`);
  }
  console.log('\ncoarse flags:');
  console.log(`  F1 in top 2:    ${summary.coarseFlags.f1InTop2}`);
  console.log(`  F5 in bottom 2: ${summary.coarseFlags.f5InBottom2}`);
  console.log(`  F4 not last:    ${summary.coarseFlags.f4NotLast}`);

  // ---- Gate ----
  const allSchemaValid = summary.schemaValidCount === summary.records.length;
  const enoughBoundsPass = summary.boundsPassedCount >= 4;
  const noUnmatched = summary.unmatchedJoinKeys.length === 0;
  const allFixturesCovered = summary.fixtureCoverage.complete;

  console.log(
      `\nschema-valid: ${summary.schemaValidCount}/${summary.records.length}` +
      `  bounds-passed: ${summary.boundsPassedCount}/${summary.records.length}` +
      `  unmatched-joinKeys: ${summary.unmatchedJoinKeys.length}` +
      `  fixtures-covered: ${allFixturesCovered}`,
  );

  if (allSchemaValid && enoughBoundsPass && noUnmatched && allFixturesCovered) {
    console.log('PASS');
    process.exit(0);
  } else {
    console.log('FAIL');
    process.exit(1);
  }
}

main();

#!/usr/bin/env tsx
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { CandidatesFileSchema } from '../../src/server/schema/candidate';
import { buildManifest, FixtureManifestSchema, loadFixtures } from './lib';

const REPO_ROOT = resolve(__dirname, '..', '..');
const FIXTURES_DIR = resolve(__dirname, 'fixtures');
const RUNS_DIR = resolve(__dirname, 'runs');

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function defaultRunId(): string {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-` +
    `${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function parseArgs(): { runId: string } {
  const args = process.argv.slice(2);
  const idx = args.indexOf('--run-id');
  if (idx >= 0 && args[idx + 1]) return { runId: args[idx + 1] };
  return { runId: defaultRunId() };
}

function main(): void {
  const { runId } = parseArgs();

  const fixtures = loadFixtures(FIXTURES_DIR);

  const candidates = fixtures.map((f) => f.metadata);
  const candResult = CandidatesFileSchema.safeParse(candidates);
  if (!candResult.success) {
    console.error('candidates derived from fixtures failed CandidatesFileSchema:');
    for (const i of candResult.error.issues) {
      console.error(`  [${i.path.join('.')}] ${i.message}`);
    }
    process.exit(1);
  }

  const manifest = buildManifest(fixtures, REPO_ROOT);
  FixtureManifestSchema.parse(manifest);

  const runDir = join(RUNS_DIR, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'candidates.json'), JSON.stringify(candidates, null, 2) + '\n');
  writeFileSync(
    join(runDir, 'fixtures-manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );

  const relRunDir = runDir.startsWith(REPO_ROOT + '/') ? runDir.slice(REPO_ROOT.length + 1) : runDir;
  console.log(`Wrote ${candidates.length} fixture candidates to ${relRunDir}/candidates.json`);
  console.log(`Wrote manifest to ${relRunDir}/fixtures-manifest.json`);
  console.log('');
  console.log('Next steps:');
  console.log(`  npm run validate:candidates ${relRunDir}/candidates.json`);
  console.log(`  # then invoke /evaluate-papers against ${relRunDir}`);
  console.log(`  npm run validate:evaluations ${relRunDir}/evaluations.json`);
  console.log(`  npm run prompt:check -- ${relRunDir}`);
}

main();

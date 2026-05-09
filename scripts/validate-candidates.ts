#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { CandidatesFileSchema } from '../src/server/schema/candidate';

const path = process.argv[2];
if (!path) {
  console.error('Usage: tsx scripts/validate-candidates.ts <path-to-candidates.json>');
  process.exit(2);
}

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`Failed to read/parse ${path}:`, e);
  process.exit(1);
}

const result = CandidatesFileSchema.safeParse(raw);
if (!result.success) {
  console.error(`✗ ${path} — schema invalid:`);
  for (const issue of result.error.issues) {
    console.error(`  [${issue.path.join('.')}] ${issue.message}`);
  }
  process.exit(1);
}

console.log(`✓ ${path} — ${result.data.length} candidates valid`);

#!/usr/bin/env tsx
import { readFileSync } from 'node:fs';
import { EvaluationsFileSchema } from '../src/server/schema/evaluation';

const path = process.argv[2];
if (!path) {
  console.error('Usage: tsx scripts/validate-evaluations.ts <path-to-evaluations.json>');
  process.exit(2);
}

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`Failed to read/parse ${path}:`, e);
  process.exit(1);
}

const result = EvaluationsFileSchema.safeParse(raw);
if (!result.success) {
  console.error(`✗ ${path} — schema invalid:`);
  for (const issue of result.error.issues) {
    console.error(`  [${issue.path.join('.')}] ${issue.message}`);
  }
  process.exit(1);
}

console.log(`✓ ${path} — ${result.data.length} evaluations valid`);

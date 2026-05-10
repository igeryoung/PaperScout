#!/usr/bin/env tsx
// One-time helper to record live source-API responses into tests/fixtures/sources/.
// Run via: tsx scripts/capture-source-fixtures.ts
// Re-run if upstream APIs drift; the unit tests parse these files verbatim.

import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ARXIV_QUERY_URL } from '@/server/sources/arxiv';
import { OPENREVIEW_QUERY_URL } from '@/server/sources/openreview';
import { HUGGINGFACE_QUERY_URL } from '@/server/sources/huggingface';

const OUT_DIR = resolve('tests/fixtures/sources');

async function captureText(url: string, file: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status} ${res.statusText}`);
  const text = await res.text();
  const path = resolve(OUT_DIR, file);
  writeFileSync(path, text, 'utf8');
  console.log(`wrote ${path} (${text.length} bytes)`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  await captureText(ARXIV_QUERY_URL, 'arxiv.xml');
  await captureText(OPENREVIEW_QUERY_URL, 'openreview.json');
  await captureText(HUGGINGFACE_QUERY_URL, 'huggingface.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

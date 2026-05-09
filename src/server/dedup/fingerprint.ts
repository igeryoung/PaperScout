import 'server-only';
import { createHash } from 'node:crypto';
import { normalizeTitle, normalizeAuthor } from './normalize';

/**
 * Build a stable duplicate-detection fingerprint for a paper.
 * Strategy (PRD §17): if a known external id is present, use it; otherwise
 * fall back to hash(normalized_title | first_author | year).
 */
export function makeFingerprint(opts: {
  title: string;
  firstAuthor: string;
  year: number;
}): string {
  const normTitle = normalizeTitle(opts.title);
  const normAuthor = normalizeAuthor(opts.firstAuthor);
  const payload = `${normTitle}|${normAuthor}|${opts.year}`;
  return createHash('sha256').update(payload).digest('hex');
}

export function arxivFingerprint(arxivId: string): string {
  return `arxiv:${arxivId}`;
}

export function openreviewFingerprint(openreviewId: string): string {
  return `openreview:${openreviewId}`;
}

/**
 * Pick the best fingerprint for a candidate, preferring external id matches
 * over title-hash matches.
 */
export function chooseFingerprint(opts: {
  source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE';
  sourcePaperId: string | null;
  title: string;
  firstAuthor: string;
  year: number;
  additionalSources?: Array<{
    source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE';
    sourcePaperId: string;
  }>;
}): string {
  // Prefer an arXiv id if it appears anywhere (primary or additionalSources)
  if (opts.source === 'ARXIV' && opts.sourcePaperId) {
    return arxivFingerprint(opts.sourcePaperId);
  }
  for (const alt of opts.additionalSources ?? []) {
    if (alt.source === 'ARXIV') return arxivFingerprint(alt.sourcePaperId);
  }
  if (opts.source === 'OPENREVIEW' && opts.sourcePaperId) {
    return openreviewFingerprint(opts.sourcePaperId);
  }
  for (const alt of opts.additionalSources ?? []) {
    if (alt.source === 'OPENREVIEW') return openreviewFingerprint(alt.sourcePaperId);
  }
  return makeFingerprint({ title: opts.title, firstAuthor: opts.firstAuthor, year: opts.year });
}

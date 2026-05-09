import 'server-only';
import { distance } from 'fastest-levenshtein';
import type { MatchMethod } from '@prisma/client';
import { normalizeTitle, normalizeAuthor } from './normalize';

export type MatchResult = {
  paperId: string;
  method: MatchMethod;
  confidence: number;
} | null;

export type MatcherDeps = {
  findBySourcePaperId(
    source: 'ARXIV' | 'OPENREVIEW',
    id: string,
  ): Promise<{ paperId: string } | null>;
  findBySourceUrl(url: string): Promise<{ paperId: string } | null>;
  findByPdfUrl(url: string): Promise<{ id: string } | null>;
  findByNormalizedTitle(t: string): Promise<{ id: string; authors: string[]; title: string } | null>;
  /** Used as a coarse fuzzy net — only invoked if no exact match found. */
  listRecentTitles(limit: number): Promise<
    Array<{ id: string; normalizedTitle: string; authors: string[]; title: string }>
  >;
};

const FUZZY_TITLE_THRESHOLD = 0.92;
const FUZZY_AUTHOR_OVERLAP_MIN = 0.5;

/**
 * Order-preserving dedup match per PRD §17.
 * Tries each signal in order; returns the first hit (with confidence).
 */
export async function findMatch(
  candidate: {
    title: string;
    authors: string[];
    sourceUrl: string;
    pdfUrl: string | null;
    sourcePaperId: string | null;
    source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE';
    additionalSources?: Array<{
      source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE';
      sourceUrl: string;
      sourcePaperId: string;
    }>;
  },
  deps: MatcherDeps,
): Promise<MatchResult> {
  // 1. arXiv id (primary or additional)
  const arxivIds = collectExternalIds(candidate, 'ARXIV');
  for (const id of arxivIds) {
    const found = await deps.findBySourcePaperId('ARXIV', id);
    if (found) return { paperId: found.paperId, method: 'ARXIV_ID', confidence: 1.0 };
  }

  // 2. OpenReview id
  const orIds = collectExternalIds(candidate, 'OPENREVIEW');
  for (const id of orIds) {
    const found = await deps.findBySourcePaperId('OPENREVIEW', id);
    if (found) return { paperId: found.paperId, method: 'OPENREVIEW_ID', confidence: 1.0 };
  }

  // 3. Exact source URL match
  const urls = [candidate.sourceUrl, ...(candidate.additionalSources ?? []).map((a) => a.sourceUrl)];
  for (const url of urls) {
    const found = await deps.findBySourceUrl(url);
    if (found) return { paperId: found.paperId, method: 'SOURCE_URL', confidence: 0.99 };
  }

  // 4. Normalized title exact match
  const norm = normalizeTitle(candidate.title);
  const titleHit = await deps.findByNormalizedTitle(norm);
  if (titleHit) {
    return { paperId: titleHit.id, method: 'NORMALIZED_TITLE', confidence: 0.97 };
  }

  // 5. PDF URL
  if (candidate.pdfUrl) {
    const pdfHit = await deps.findByPdfUrl(candidate.pdfUrl);
    if (pdfHit) return { paperId: pdfHit.id, method: 'PDF_URL', confidence: 0.96 };
  }

  // 6. Fuzzy title (Levenshtein) gated by author overlap
  const recent = await deps.listRecentTitles(500);
  const candAuthors = new Set(candidate.authors.map(normalizeAuthor));
  let best: { id: string; sim: number } | null = null;
  for (const row of recent) {
    if (row.normalizedTitle.length === 0) continue;
    const longer = Math.max(row.normalizedTitle.length, norm.length);
    if (longer === 0) continue;
    const sim = 1 - distance(row.normalizedTitle, norm) / longer;
    if (sim < FUZZY_TITLE_THRESHOLD) continue;
    const rowAuthors = new Set(row.authors.map(normalizeAuthor));
    const intersection = [...candAuthors].filter((a) => rowAuthors.has(a)).length;
    const overlap =
      intersection / Math.max(1, Math.min(candAuthors.size, rowAuthors.size));
    if (overlap < FUZZY_AUTHOR_OVERLAP_MIN) continue;
    if (!best || sim > best.sim) best = { id: row.id, sim };
  }
  if (best) {
    return { paperId: best.id, method: 'FUZZY_TITLE', confidence: best.sim };
  }

  return null;
}

function collectExternalIds(
  cand: {
    source: string;
    sourcePaperId: string | null;
    additionalSources?: Array<{ source: string; sourcePaperId: string }>;
  },
  target: 'ARXIV' | 'OPENREVIEW',
): string[] {
  const ids: string[] = [];
  if (cand.source === target && cand.sourcePaperId) ids.push(cand.sourcePaperId);
  for (const alt of cand.additionalSources ?? []) {
    if (alt.source === target) ids.push(alt.sourcePaperId);
  }
  return ids;
}

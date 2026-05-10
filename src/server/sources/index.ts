import type { Candidate } from '@/server/schema/candidate';
import { logger } from '@/lib/logger';
import { normalizeTitle } from '@/server/dedup/normalize';
import { fetchArxiv } from './arxiv';
import { fetchOpenReview } from './openreview';
import { fetchHuggingFace } from './huggingface';
import type { ClientDeps, SourceFetchResult, SourceName } from './types';

const SOURCE_PRIORITY: Record<SourceName, number> = {
  ARXIV: 0,
  OPENREVIEW: 1,
  HUGGINGFACE: 2,
};

const DEFAULT_QUOTAS: Record<SourceName, number> = {
  ARXIV: 15,
  HUGGINGFACE: 10,
  OPENREVIEW: 5,
};

export interface CollectOptions {
  targetCount?: number;
  fetchers?: {
    arxiv?: (deps?: ClientDeps) => Promise<Candidate[]>;
    openreview?: (deps?: ClientDeps) => Promise<Candidate[]>;
    huggingface?: (deps?: ClientDeps) => Promise<Candidate[]>;
  };
}

function dedupKeysFor(c: Candidate): string[] {
  const keys: string[] = [];
  if (c.source === 'ARXIV' && c.sourcePaperId) keys.push(`arxiv:${c.sourcePaperId}`);
  if (c.source === 'OPENREVIEW' && c.sourcePaperId) keys.push(`openreview:${c.sourcePaperId}`);
  for (const alt of c.additionalSources ?? []) {
    if (alt.source === 'ARXIV') keys.push(`arxiv:${alt.sourcePaperId}`);
    if (alt.source === 'OPENREVIEW') keys.push(`openreview:${alt.sourcePaperId}`);
  }
  const norm = normalizeTitle(c.title);
  if (norm) keys.push(`title:${norm}`);
  return keys;
}

function mergeAdditional(primary: Candidate, other: Candidate): Candidate {
  // Track every identity already represented by `primary` (its own source + any
  // existing additionalSources) so we never add a duplicate identity that would
  // later violate the DB's @@unique([source, sourcePaperId]) on PaperSource.
  const seen = new Set<string>();
  if (primary.sourcePaperId) seen.add(`${primary.source}:${primary.sourcePaperId}`);
  for (const a of primary.additionalSources) {
    seen.add(`${a.source}:${a.sourcePaperId}`);
  }

  const merged = [...primary.additionalSources];

  // The other candidate's own identity → fold into additionalSources if novel.
  if (other.sourcePaperId) {
    const key = `${other.source}:${other.sourcePaperId}`;
    if (!seen.has(key)) {
      merged.push({
        source: other.source,
        sourceUrl: other.sourceUrl,
        sourcePaperId: other.sourcePaperId,
      });
      seen.add(key);
    }
  }
  // The other candidate's already-known additionalSources → fold each in if novel.
  for (const alt of other.additionalSources) {
    const key = `${alt.source}:${alt.sourcePaperId}`;
    if (!seen.has(key)) {
      merged.push(alt);
      seen.add(key);
    }
  }

  const codeUrls = Array.from(new Set([...primary.codeUrls, ...other.codeUrls]));

  return { ...primary, additionalSources: merged, codeUrls };
}

/**
 * Within-batch dedup: collapse candidates that share an arXiv id, OpenReview id,
 * or normalized title into a single record. Higher-priority source wins
 * (ARXIV > OPENREVIEW > HUGGINGFACE); the loser's identity is folded into
 * `additionalSources` and `codeUrls` are merged.
 */
export function dedupWithinBatch(input: Candidate[]): Candidate[] {
  // Sort so the highest-priority candidate is processed first; collisions are merged into it.
  const sorted = [...input].sort(
    (a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source],
  );

  const groupByKey = new Map<string, number>(); // key → groupIndex
  const groups: Candidate[] = [];

  for (const cand of sorted) {
    const keys = dedupKeysFor(cand);
    const hits = new Set<number>();
    for (const k of keys) {
      const g = groupByKey.get(k);
      if (g !== undefined) hits.add(g);
    }

    if (hits.size === 0) {
      const newIdx = groups.length;
      groups.push(cand);
      for (const k of keys) groupByKey.set(k, newIdx);
      continue;
    }

    // Merge into the lowest existing group index (which holds the highest-priority candidate
    // since we iterate in priority order).
    const targetIdx = Math.min(...hits);
    const merged = mergeAdditional(groups[targetIdx], cand);
    groups[targetIdx] = merged;

    // Re-key the (possibly newly minted) keys back to targetIdx so subsequent matches collapse here.
    for (const k of keys) groupByKey.set(k, targetIdx);
    for (const k of dedupKeysFor(merged)) groupByKey.set(k, targetIdx);

    // Other groups that were transitively hit collapse into target as well.
    for (const idx of hits) {
      if (idx === targetIdx) continue;
      const collapsed = groups[idx];
      groups[targetIdx] = mergeAdditional(groups[targetIdx], collapsed);
      for (const k of dedupKeysFor(collapsed)) groupByKey.set(k, targetIdx);
      // Mark the now-redundant slot; we'll filter it out at the end.
      groups[idx] = null as unknown as Candidate;
    }
  }

  return groups.filter((g): g is Candidate => g !== null);
}

function applyQuotas(
  candidates: Candidate[],
  targetCount: number,
  quotas: Record<SourceName, number>,
): Candidate[] {
  const bySource: Record<SourceName, Candidate[]> = { ARXIV: [], OPENREVIEW: [], HUGGINGFACE: [] };
  for (const c of candidates) bySource[c.source].push(c);

  const picked: Candidate[] = [];
  const leftovers: Candidate[] = [];

  // First pass: take up to quota per source, in priority order.
  const orderedSources: SourceName[] = (Object.keys(SOURCE_PRIORITY) as SourceName[]).sort(
    (a, b) => SOURCE_PRIORITY[a] - SOURCE_PRIORITY[b],
  );
  for (const s of orderedSources) {
    const pool = bySource[s];
    const take = Math.min(quotas[s], pool.length);
    picked.push(...pool.slice(0, take));
    leftovers.push(...pool.slice(take));
  }

  // Second pass: refill any deficit from leftovers, still in priority order.
  if (picked.length < targetCount) {
    leftovers.sort((a, b) => SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source]);
    for (const c of leftovers) {
      if (picked.length >= targetCount) break;
      picked.push(c);
    }
  }

  return picked.slice(0, targetCount);
}

export async function collectFromAllSources(
  opts: CollectOptions = {},
): Promise<Candidate[]> {
  const targetCount = opts.targetCount ?? 30;
  const fetchers = {
    arxiv: opts.fetchers?.arxiv ?? fetchArxiv,
    openreview: opts.fetchers?.openreview ?? fetchOpenReview,
    huggingface: opts.fetchers?.huggingface ?? fetchHuggingFace,
  };

  const settled = await Promise.allSettled([
    fetchers.arxiv(),
    fetchers.openreview(),
    fetchers.huggingface(),
  ]);

  const results: SourceFetchResult[] = [
    {
      name: 'ARXIV',
      candidates: settled[0].status === 'fulfilled' ? settled[0].value : [],
      error: settled[0].status === 'rejected' ? String(settled[0].reason) : undefined,
    },
    {
      name: 'OPENREVIEW',
      candidates: settled[1].status === 'fulfilled' ? settled[1].value : [],
      error: settled[1].status === 'rejected' ? String(settled[1].reason) : undefined,
    },
    {
      name: 'HUGGINGFACE',
      candidates: settled[2].status === 'fulfilled' ? settled[2].value : [],
      error: settled[2].status === 'rejected' ? String(settled[2].reason) : undefined,
    },
  ];

  for (const r of results) {
    if (r.error) {
      logger.error(
        { event: 'source_fetch_failed', source: r.name, error: r.error },
        'Source fetch failed',
      );
    } else {
      logger.info(
        { event: 'source_fetch_succeeded', source: r.name, count: r.candidates.length },
        'Source fetch succeeded',
      );
    }
  }

  const merged = results.flatMap((r) => r.candidates);
  const deduped = dedupWithinBatch(merged);
  logger.info(
    {
      event: 'source_candidates_deduped',
      mergedCount: merged.length,
      dedupedCount: deduped.length,
      targetCount,
    },
    'Source candidates deduped',
  );

  const final = applyQuotas(deduped, targetCount, DEFAULT_QUOTAS);
  const finalBySource: Record<SourceName, number> = {
    ARXIV: 0,
    OPENREVIEW: 0,
    HUGGINGFACE: 0,
  };
  for (const c of final) finalBySource[c.source]++;
  logger.info(
    {
      event: 'source_candidates_selected',
      finalCount: final.length,
      targetCount,
      counts: finalBySource,
      isPartial: final.length < targetCount,
    },
    'Source candidates selected',
  );

  return final;
}

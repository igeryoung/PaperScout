import { logger } from '@/lib/logger';
import { CandidateSchema } from '@/server/schema/candidate';
import type { Candidate } from '@/server/schema/candidate';
import type { ClientDeps } from './types';
import { fetchWithTimeout } from './http';

export const TOP_CV_VENUES: Array<{ id: string; name: string }> = [
  { id: 'CVPR.cc/2025/Conference', name: 'CVPR 2025' },
  { id: 'ICCV.cc/2025/Conference', name: 'ICCV 2025' },
  { id: 'ECCV/2024/Conference', name: 'ECCV 2024' },
  { id: 'ICLR.cc/2025/Conference', name: 'ICLR 2025' },
  { id: 'NeurIPS.cc/2024/Conference', name: 'NeurIPS 2024' },
  { id: 'ICML.cc/2025/Conference', name: 'ICML 2025' },
  { id: 'WACV/2025/Conference', name: 'WACV 2025' },
];

function venueQueryUrl(venueId: string, limit = 10): string {
  return `https://api2.openreview.net/notes?content.venueid=${encodeURIComponent(venueId)}&limit=${limit}&sort=cdate:desc`;
}

// Used by capture-source-fixtures.ts and unit tests.
export const OPENREVIEW_QUERY_URL = venueQueryUrl(TOP_CV_VENUES[0].id, 30);

const GITHUB_URL_RE = /https?:\/\/github\.com\/[A-Za-z0-9_.\-/#?=&]+/g;

type ORValue<T> = { value?: T } | undefined;
type ORNote = {
  id?: string;
  pdate?: number;
  cdate?: number;
  content?: {
    title?: ORValue<string>;
    authors?: ORValue<string[]>;
    abstract?: ORValue<string>;
    venue?: ORValue<string>;
    venueid?: ORValue<string>;
  };
};

type ORResponse = { notes?: ORNote[] };

function val<T>(v: ORValue<T>): T | null {
  if (!v || v.value === undefined || v.value === null) return null;
  return v.value;
}

function collapseWs(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function extractGithubUrls(text: string): string[] {
  const matches = text.match(GITHUB_URL_RE) ?? [];
  const cleaned = matches.map((u) => u.replace(/[.,;:)\]>]+$/g, ''));
  return Array.from(new Set(cleaned));
}

function epochToISODate(epochMs: number | undefined): string | null {
  if (!epochMs || !Number.isFinite(epochMs)) return null;
  const d = new Date(epochMs);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function parseOpenReview(json: ORResponse): Candidate[] {
  const notes = json.notes ?? [];
  const out: Candidate[] = [];
  for (const n of notes) {
    if (!n.id) continue;
    const title = collapseWs(val(n.content?.title));
    const authors = (val(n.content?.authors) ?? [])
      .map((a) => collapseWs(a))
      .filter((a): a is string => a.length > 0);
    if (!title || authors.length === 0) continue;

    const abstractRaw = collapseWs(val(n.content?.abstract));
    const venue = collapseWs(val(n.content?.venue) ?? val(n.content?.venueid)) || null;
    const publishedDate = epochToISODate(n.pdate ?? n.cdate);
    if (!publishedDate) continue;

    const codeUrls = abstractRaw ? extractGithubUrls(abstractRaw) : [];

    const candidate = {
      title,
      authors,
      abstract: abstractRaw || null,
      venue,
      publishedDate,
      sourceUrl: `https://openreview.net/forum?id=${n.id}`,
      pdfUrl: `https://openreview.net/pdf?id=${n.id}`,
      sourcePaperId: n.id,
      source: 'OPENREVIEW' as const,
      codeUrls,
      additionalSources: [],
    };

    const result = CandidateSchema.safeParse(candidate);
    if (result.success) {
      out.push(result.data);
    } else {
      logger.warn(
        {
          event: 'source_candidate_invalid',
          source: 'OPENREVIEW',
          sourcePaperId: n.id,
          issues: result.error.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        },
        'Dropping invalid source candidate',
      );
    }
  }
  return out;
}

export async function fetchOpenReview(deps: ClientDeps = {}): Promise<Candidate[]> {
  const fetchFn = deps.fetch ?? globalThis.fetch;

  const settled = await Promise.allSettled(
    TOP_CV_VENUES.map(async ({ id, name }) => {
      const res = await fetchWithTimeout(fetchFn, venueQueryUrl(id), {
        timeoutMs: deps.timeoutMs,
      });
      if (!res.ok) {
        throw new Error(`openreview venue fetch failed (${name}): ${res.status} ${res.statusText}`);
      }
      const json = (await res.json()) as ORResponse;
      return parseOpenReview(json);
    }),
  );

  const candidates: Candidate[] = [];
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status === 'fulfilled') {
      candidates.push(...r.value);
    } else {
      logger.warn(
        { event: 'openreview_venue_fetch_failed', venue: TOP_CV_VENUES[i].name, error: String(r.reason) },
        'OpenReview venue fetch failed',
      );
    }
  }

  const seen = new Set<string>();
  return candidates.filter((c) => {
    if (!c.sourcePaperId || seen.has(c.sourcePaperId)) return false;
    seen.add(c.sourcePaperId);
    return true;
  });
}

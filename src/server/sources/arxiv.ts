import { XMLParser } from 'fast-xml-parser';
import { logger } from '@/lib/logger';
import { CandidateSchema } from '@/server/schema/candidate';
import type { Candidate } from '@/server/schema/candidate';
import type { ClientDeps } from './types';
import { fetchWithTimeout } from './http';

export const ARXIV_QUERY_URL =
  'https://export.arxiv.org/api/query?search_query=cat:cs.CV&sortBy=submittedDate&sortOrder=descending&max_results=50';

const GITHUB_URL_RE = /https?:\/\/github\.com\/[A-Za-z0-9_.\-/#?=&]+/g;

type AtomLink = { '@_href'?: string; '@_rel'?: string; '@_type'?: string };
type AtomAuthor = { name?: string };
type AtomEntry = {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  author?: AtomAuthor[];
  link?: AtomLink[];
};

function collapseWs(s: string | undefined | null): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function extractGithubUrls(text: string): string[] {
  const matches = text.match(GITHUB_URL_RE) ?? [];
  // Trim trailing punctuation that often clings to URLs in abstracts.
  const cleaned = matches.map((u) => u.replace(/[.,;:)\]>]+$/g, ''));
  return Array.from(new Set(cleaned));
}

function arxivIdFromAtomId(atomId: string): string | null {
  // e.g. http://arxiv.org/abs/2605.12345v1 → 2605.12345
  const last = atomId.split('/').pop() ?? '';
  return last.replace(/v\d+$/, '') || null;
}

export function parseArxivAtom(xml: string): Candidate[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (name) => name === 'entry' || name === 'author' || name === 'link',
  });
  const parsed = parser.parse(xml) as { feed?: { entry?: AtomEntry[] } };
  const entries = parsed.feed?.entry ?? [];

  const out: Candidate[] = [];
  for (const e of entries) {
    const atomId = e.id ?? '';
    const sourcePaperId = arxivIdFromAtomId(atomId);
    if (!sourcePaperId) continue;

    const sourceUrl = atomId.replace(/^http:\/\//, 'https://');
    const pdfLink = (e.link ?? []).find((l) => l['@_type'] === 'application/pdf');
    const pdfUrl = pdfLink?.['@_href'] ?? null;

    const title = collapseWs(e.title);
    const abstract = collapseWs(e.summary);
    const publishedDate = (e.published ?? '').slice(0, 10);
    const authors = (e.author ?? [])
      .map((a) => collapseWs(a.name))
      .filter((n): n is string => Boolean(n));

    if (!title || authors.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(publishedDate)) {
      continue;
    }

    const codeUrls = abstract ? extractGithubUrls(abstract) : [];

    const candidate = {
      title,
      authors,
      abstract: abstract || null,
      venue: null,
      publishedDate,
      sourceUrl,
      pdfUrl,
      sourcePaperId,
      source: 'ARXIV' as const,
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
          source: 'ARXIV',
          sourcePaperId,
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

export async function fetchArxiv(deps: ClientDeps = {}): Promise<Candidate[]> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const res = await fetchWithTimeout(fetchFn, ARXIV_QUERY_URL, {
    timeoutMs: deps.timeoutMs,
  });
  if (!res.ok) {
    throw new Error(`arxiv fetch failed: ${res.status} ${res.statusText}`);
  }
  const xml = await res.text();
  return parseArxivAtom(xml);
}

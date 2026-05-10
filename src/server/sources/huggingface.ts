import { logger } from '@/lib/logger';
import { CandidateSchema } from '@/server/schema/candidate';
import type { Candidate } from '@/server/schema/candidate';
import type { ClientDeps } from './types';
import { fetchWithTimeout } from './http';

export const HUGGINGFACE_QUERY_URL = 'https://huggingface.co/api/daily_papers';

const ARXIV_ID_RE = /^\d{4}\.\d{4,5}$/;
const GITHUB_URL_RE = /https?:\/\/github\.com\/[A-Za-z0-9_.\-/#?=&]+/g;

const CV_KEYWORDS = [
  'vision',
  'image',
  'video',
  'segment',
  'detect',
  '3d',
  'nerf',
  'gaussian',
  'render',
  'diffusion',
  'scene',
  'pose',
  'recogni',
  'optical',
  'depth',
  'point cloud',
  'object',
  'tracking',
  'vlm',
  'multimodal',
];

type HFAuthor = { name?: string; user?: { fullname?: string } };
type HFPaper = {
  id?: string;
  title?: string;
  summary?: string;
  authors?: HFAuthor[];
  publishedAt?: string;
};
type HFEntry = {
  title?: string;
  paper?: HFPaper;
  publishedAt?: string;
};

function collapseWs(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function extractGithubUrls(text: string): string[] {
  const matches = text.match(GITHUB_URL_RE) ?? [];
  const cleaned = matches.map((u) => u.replace(/[.,;:)\]>]+$/g, ''));
  return Array.from(new Set(cleaned));
}

function isComputerVision(title: string, abstract: string): boolean {
  const haystack = `${title} ${abstract}`.toLowerCase();
  return CV_KEYWORDS.some((k) => haystack.includes(k));
}

function isoDate(input: string | undefined): string | null {
  if (!input) return null;
  const slice = input.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

export function parseHuggingFace(entries: HFEntry[]): Candidate[] {
  const out: Candidate[] = [];
  for (const entry of entries) {
    const paper = entry.paper ?? {};
    const id = paper.id;
    if (!id) continue;

    const title = collapseWs(paper.title ?? entry.title);
    const authors = (paper.authors ?? [])
      .map((a) => collapseWs(a.name ?? a.user?.fullname))
      .filter((a): a is string => a.length > 0);
    if (!title || authors.length === 0) continue;

    const abstract = collapseWs(paper.summary);
    const publishedDate = isoDate(paper.publishedAt ?? entry.publishedAt);
    if (!publishedDate) continue;

    if (!isComputerVision(title, abstract)) continue;

    const isArxivSlug = ARXIV_ID_RE.test(id);
    const pdfUrl = isArxivSlug ? `https://arxiv.org/pdf/${id}` : null;
    const additionalSources = isArxivSlug
      ? [
          {
            source: 'ARXIV' as const,
            sourceUrl: `https://arxiv.org/abs/${id}`,
            sourcePaperId: id,
          },
        ]
      : [];

    const codeUrls = abstract ? extractGithubUrls(abstract) : [];

    const candidate = {
      title,
      authors,
      abstract: abstract || null,
      venue: null,
      publishedDate,
      sourceUrl: `https://huggingface.co/papers/${id}`,
      pdfUrl,
      sourcePaperId: id,
      source: 'HUGGINGFACE' as const,
      codeUrls,
      additionalSources,
    };

    const result = CandidateSchema.safeParse(candidate);
    if (result.success) {
      out.push(result.data);
    } else {
      logger.warn(
        {
          event: 'source_candidate_invalid',
          source: 'HUGGINGFACE',
          sourcePaperId: id,
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

export async function fetchHuggingFace(deps: ClientDeps = {}): Promise<Candidate[]> {
  const fetchFn = deps.fetch ?? globalThis.fetch;
  const res = await fetchWithTimeout(fetchFn, HUGGINGFACE_QUERY_URL, {
    timeoutMs: deps.timeoutMs,
  });
  if (!res.ok) {
    throw new Error(`huggingface fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as HFEntry[];
  return parseHuggingFace(Array.isArray(json) ? json : []);
}

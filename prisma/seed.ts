/**
 * Phase 1 seed: 5 papers spanning ARXIV / OPENREVIEW / HUGGINGFACE.
 *
 * Includes one near-duplicate pair (papers #1 and #5) — same normalized title,
 * different first authors, different arXiv ids → DIFFERENT duplicateFingerprints.
 * Both rows insert. The dedup matcher's `normalized_title` step (PRD §17) would
 * catch the second on a real ingest run; the seed deliberately bypasses dedup
 * so /library shows the matchable pair side-by-side for inspection.
 *
 * Idempotent: checks papersRepo.findByFingerprint before each create.
 * Re-running yields 0 inserts.
 */

import { papersRepo } from '../src/server/repos/papers';
import { sourcesRepo } from '../src/server/repos/sources';
import { normalizeTitle } from '../src/server/dedup/normalize';
import { chooseFingerprint } from '../src/server/dedup/fingerprint';
import type { Source } from '@prisma/client';

type SeedRecord = {
  title: string;
  authors: string[];
  abstract: string | null;
  venue: string | null;
  publishedDate: string;
  pdfUrl: string | null;
  primarySource: Source;
  sourcePaperId: string | null;
  sourceUrl: string;
};

const SEEDS: SeedRecord[] = [
  {
    title: 'Vision Transformers for Long-Range Object Detection',
    authors: ['Alice Wong', 'Bob Chen', 'Carol Li'],
    abstract:
      'We propose a transformer architecture for object detection that scales to 4K imagery via sparse attention.',
    venue: null,
    publishedDate: '2026-04-21',
    pdfUrl: 'https://arxiv.org/pdf/2604.12345v1.pdf',
    primarySource: 'ARXIV',
    sourcePaperId: '2604.12345',
    sourceUrl: 'https://arxiv.org/abs/2604.12345',
  },
  {
    title: 'Self-Supervised Depth Estimation in the Wild',
    authors: ['David Kim', 'Eve Zhao'],
    abstract:
      'A purely self-supervised pipeline that learns metric depth from single in-the-wild RGB videos.',
    venue: null,
    publishedDate: '2026-04-29',
    pdfUrl: 'https://arxiv.org/pdf/2604.13579v2.pdf',
    primarySource: 'ARXIV',
    sourcePaperId: '2604.13579',
    sourceUrl: 'https://arxiv.org/abs/2604.13579',
  },
  {
    title: 'Diffusion Models for 3D Scene Reconstruction',
    authors: ['Frank Liu', 'Grace Patel'],
    abstract:
      'A diffusion prior over neural radiance fields enables single-view 3D scene reconstruction.',
    venue: 'CVPR 2026',
    publishedDate: '2026-03-15',
    pdfUrl: 'https://openreview.net/pdf?id=x7yQ8mNpRk',
    primarySource: 'OPENREVIEW',
    sourcePaperId: 'x7yQ8mNpRk',
    sourceUrl: 'https://openreview.net/forum?id=x7yQ8mNpRk',
  },
  {
    title: 'MiniCLIP: Efficient Vision-Language Pretraining',
    authors: ['Henry Ito'],
    abstract:
      'A 90M-parameter CLIP variant matching ViT-B/16 zero-shot accuracy at 12% of the FLOPs.',
    venue: null,
    publishedDate: '2026-05-02',
    pdfUrl: null,
    primarySource: 'HUGGINGFACE',
    sourcePaperId: 'miniclip-2026',
    sourceUrl: 'https://huggingface.co/papers/miniclip-2026',
  },
  {
    // Near-duplicate of #1: same normalized title, different first author + arXiv id.
    title: 'Vision transformers for long-range object detection',
    authors: ['Zoe Park', 'Yi Wei'],
    abstract:
      'An independent re-derivation of long-range ViT detectors with extended ablations on KITTI.',
    venue: null,
    publishedDate: '2026-04-25',
    pdfUrl: 'https://arxiv.org/pdf/2604.99999v1.pdf',
    primarySource: 'ARXIV',
    sourcePaperId: '2604.99999',
    sourceUrl: 'https://arxiv.org/abs/2604.99999',
  },
];

async function seedOne(rec: SeedRecord): Promise<'created' | 'exists'> {
  const year = new Date(rec.publishedDate).getUTCFullYear();
  const fingerprint = chooseFingerprint({
    source: rec.primarySource,
    sourcePaperId: rec.sourcePaperId,
    title: rec.title,
    firstAuthor: rec.authors[0] ?? '',
    year,
  });

  const existing = await papersRepo.findByFingerprint(fingerprint);
  if (existing) {
    if (!(await sourcesRepo.exists(existing.id, rec.primarySource))) {
      await sourcesRepo.create({
        paperId: existing.id,
        source: rec.primarySource,
        sourceUrl: rec.sourceUrl,
        sourcePaperId: rec.sourcePaperId,
        pdfUrl: rec.pdfUrl,
      });
    }
    return 'exists';
  }

  const paper = await papersRepo.create({
    title: rec.title,
    normalizedTitle: normalizeTitle(rec.title),
    authors: rec.authors,
    abstract: rec.abstract,
    venue: rec.venue,
    publishedDate: new Date(rec.publishedDate),
    pdfUrl: rec.pdfUrl,
    primarySource: rec.primarySource,
    duplicateFingerprint: fingerprint,
  });

  await sourcesRepo.create({
    paperId: paper.id,
    source: rec.primarySource,
    sourceUrl: rec.sourceUrl,
    sourcePaperId: rec.sourcePaperId,
    pdfUrl: rec.pdfUrl,
  });

  return 'created';
}

async function main() {
  let created = 0;
  let existed = 0;
  for (const rec of SEEDS) {
    const result = await seedOne(rec);
    if (result === 'created') created += 1;
    else existed += 1;
  }
  console.log(
    `Seed complete: ${created} created, ${existed} already present (total ${SEEDS.length}).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .then(async () => {
    const { db } = await import('../src/lib/db');
    await db.$disconnect();
  });

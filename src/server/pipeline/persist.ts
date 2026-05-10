import type { Candidate } from '@/server/schema/candidate';
import { findMatch } from '@/server/dedup/matcher';
import { chooseFingerprint } from '@/server/dedup/fingerprint';
import { normalizeTitle } from '@/server/dedup/normalize';
import { papersRepo } from '@/server/repos/papers';
import { sourcesRepo } from '@/server/repos/sources';
import { runResultsRepo } from '@/server/repos/runResults';
import { duplicatesRepo } from '@/server/repos/duplicates';
import { codeLinksRepo } from '@/server/repos/codeLinks';

export interface PersistSummary {
  newCount: number;
  existingCount: number;
  skipped: number;
}

/**
 * Persist a deduped batch of candidates to the database against `runId`.
 * Mirrors `scripts/ingest.ts:111-222` but operates on an in-memory list and
 * skips the evaluation/ranking steps (Phase 3).
 *
 * Adds a `seenPaperId` guard so two candidates that resolve (via fuzzy match)
 * to the same existing Paper don't violate `paper_run_results` unique constraint.
 */
export async function persistCandidates(
  runId: string,
  cands: Candidate[],
): Promise<PersistSummary> {
  const matcherDeps = {
    findBySourcePaperId: (s: 'ARXIV' | 'OPENREVIEW', id: string) =>
      sourcesRepo.findBySourcePaperId(s, id),
    findBySourceUrl: (url: string) => sourcesRepo.findBySourceUrl(url),
    findByPdfUrl: (url: string) => papersRepo.findByPdfUrl(url),
    findByNormalizedTitle: (n: string) => papersRepo.findByNormalizedTitle(n),
    listRecentTitles: (limit: number) => papersRepo.listRecentForFuzzy(limit),
  };

  const seenPaperId = new Set<string>();
  let newCount = 0;
  let existingCount = 0;
  let skipped = 0;

  for (const cand of cands) {
    const match = await findMatch(cand, matcherDeps);
    let paperId: string;
    let collectionStatus: 'NEW' | 'EXISTING';

    if (!match) {
      const fingerprint = chooseFingerprint({
        source: cand.source,
        sourcePaperId: cand.sourcePaperId,
        title: cand.title,
        firstAuthor: cand.authors[0] ?? '',
        year: new Date(cand.publishedDate).getFullYear(),
        additionalSources: cand.additionalSources,
      });
      const paper = await papersRepo.create({
        title: cand.title,
        normalizedTitle: normalizeTitle(cand.title),
        authors: cand.authors,
        abstract: cand.abstract,
        venue: cand.venue,
        publishedDate: new Date(cand.publishedDate),
        pdfUrl: cand.pdfUrl,
        primarySource: cand.source,
        duplicateFingerprint: fingerprint,
      });
      paperId = paper.id;
      await sourcesRepo.create({
        paperId,
        source: cand.source,
        sourceUrl: cand.sourceUrl,
        sourcePaperId: cand.sourcePaperId,
        pdfUrl: cand.pdfUrl,
      });
      for (const alt of cand.additionalSources) {
        await sourcesRepo.create({
          paperId,
          source: alt.source,
          sourceUrl: alt.sourceUrl,
          sourcePaperId: alt.sourcePaperId,
          pdfUrl: null,
        });
      }
      collectionStatus = 'NEW';
      newCount++;
    } else {
      paperId = match.paperId;
      if (match.method === 'FUZZY_TITLE' || match.method === 'NORMALIZED_TITLE') {
        await duplicatesRepo.create({
          canonicalPaperId: paperId,
          duplicatePaperId: paperId,
          matchMethod: match.method,
          confidence: match.confidence,
        });
      }
      if (
        !(await sourcesRepo.existsIdentity({
          paperId,
          source: cand.source,
          sourcePaperId: cand.sourcePaperId,
          sourceUrl: cand.sourceUrl,
        }))
      ) {
        await sourcesRepo.create({
          paperId,
          source: cand.source,
          sourceUrl: cand.sourceUrl,
          sourcePaperId: cand.sourcePaperId,
          pdfUrl: cand.pdfUrl,
        });
      }
      for (const alt of cand.additionalSources) {
        if (
          !(await sourcesRepo.existsIdentity({
            paperId,
            source: alt.source,
            sourcePaperId: alt.sourcePaperId,
            sourceUrl: alt.sourceUrl,
          }))
        ) {
          await sourcesRepo.create({
            paperId,
            source: alt.source,
            sourceUrl: alt.sourceUrl,
            sourcePaperId: alt.sourcePaperId,
            pdfUrl: null,
          });
        }
      }
      collectionStatus = 'EXISTING';
      existingCount++;
    }

    if (seenPaperId.has(paperId)) {
      // A second candidate in this batch resolved to the same paperId.
      // The within-batch dedup at the aggregator should normally prevent this,
      // but a fuzzy match against an existing Paper can still collide here.
      skipped++;
    } else {
      await runResultsRepo.create({ runId, paperId, collectionStatus });
      seenPaperId.add(paperId);
    }

    if (cand.codeUrls.length) {
      await codeLinksRepo.addAll(paperId, cand.codeUrls);
    }
  }

  return { newCount, existingCount, skipped };
}

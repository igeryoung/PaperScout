#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { CandidatesFileSchema } from '@/server/schema/candidate';
import { EvaluationsFileSchema } from '@/server/schema/evaluation';
import { findMatch } from '@/server/dedup/matcher';
import { chooseFingerprint } from '@/server/dedup/fingerprint';
import { normalizeTitle } from '@/server/dedup/normalize';
import { papersRepo } from '@/server/repos/papers';
import { sourcesRepo } from '@/server/repos/sources';
import { runsRepo } from '@/server/repos/runs';
import { runResultsRepo } from '@/server/repos/runResults';
import { evaluationsRepo } from '@/server/repos/evaluations';
import { tagsRepo } from '@/server/repos/tags';
import { codeLinksRepo } from '@/server/repos/codeLinks';
import { duplicatesRepo } from '@/server/repos/duplicates';

async function main() {
  // ---------- CLI ----------
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => !a.startsWith('--'));
  const force = args.includes('--force');

  if (!dirArg) {
    console.error('Usage: tsx scripts/ingest.ts <run-dir> [--force]');
    process.exit(2);
  }

  const runDir = resolve(dirArg);
  const candidatesPath = join(runDir, 'candidates.json');
  const evaluationsPath = join(runDir, 'evaluations.json');

  for (const p of [candidatesPath, evaluationsPath]) {
    if (!existsSync(p)) {
      console.error(`Missing file: ${p}`);
      process.exit(1);
    }
  }

  // ---------- Validate ----------
  const candRaw = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  const evalRaw = JSON.parse(readFileSync(evaluationsPath, 'utf8'));

  const candResult = CandidatesFileSchema.safeParse(candRaw);
  if (!candResult.success) {
    console.error('candidates.json schema invalid:');
    for (const i of candResult.error.issues)
      console.error(`  [${i.path.join('.')}] ${i.message}`);
    process.exit(1);
  }
  const evalResult = EvaluationsFileSchema.safeParse(evalRaw);
  if (!evalResult.success) {
    console.error('evaluations.json schema invalid:');
    for (const i of evalResult.error.issues)
      console.error(`  [${i.path.join('.')}] ${i.message}`);
    process.exit(1);
  }

  const candidates = candResult.data;
  const evaluations = evalResult.data;

  // ---------- Sanity: every evaluation joinKey matches a candidate ----------
  const candByKey = new Map<string, (typeof candidates)[number]>();
  for (const c of candidates) {
    if (!c.sourcePaperId) continue;
    candByKey.set(`${c.source}:${c.sourcePaperId}`, c);
    for (const alt of c.additionalSources) {
      candByKey.set(`${alt.source}:${alt.sourcePaperId}`, c);
    }
  }
  for (const e of evaluations) {
    const key = `${e.joinKey.source}:${e.joinKey.sourcePaperId}`;
    if (!candByKey.has(key)) {
      console.error(`evaluation joinKey ${key} does not match any candidate`);
      process.exit(1);
    }
  }

  // ---------- Idempotency ----------
  const existing = await runsRepo.findByIngestSourceDir(runDir);
  if (existing && !force) {
    console.error(
      `Run dir already ingested as run ${existing.id}; use --force to delete and re-ingest`,
    );
    process.exit(1);
  }
  if (existing && force) {
    console.log(`--force: deleting prior run ${existing.id} (cascade)`);
    await db.dailyRun.delete({ where: { id: existing.id } });
  }

  // ---------- Prompt version (SHA-256 of evaluate-papers SKILL.md) ----------
  let promptVersion = 'evaluate-papers:unset';
  const skillPath = resolve('.claude/skills/evaluate-papers/SKILL.md');
  if (existsSync(skillPath)) {
    const body = readFileSync(skillPath, 'utf8');
    promptVersion = `evaluate-papers:${createHash('sha256').update(body).digest('hex').slice(0, 12)}`;
  }

  // ---------- Create run ----------
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const run = await runsRepo.create({
    runDate: today,
    ingestSourceDir: runDir,
    candidateCount: candidates.length,
  });

  // ---------- Persist candidates with dedup ----------
  const matcherDeps = {
    findBySourcePaperId: (s: 'ARXIV' | 'OPENREVIEW', id: string) =>
      sourcesRepo.findBySourcePaperId(s, id),
    findBySourceUrl: (url: string) => sourcesRepo.findBySourceUrl(url),
    findByPdfUrl: (url: string) => papersRepo.findByPdfUrl(url),
    findByNormalizedTitle: (n: string) => papersRepo.findByNormalizedTitle(n),
    listRecentTitles: (limit: number) => papersRepo.listRecentForFuzzy(limit),
  };

  const paperIdByJoinKey = new Map<string, string>();
  let newCount = 0;
  let existingCount = 0;

  for (const cand of candidates) {
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
      // Record duplicate edge if the new candidate would have been treated as a separate paper
      // (the canonical paper already exists; this candidate is the duplicate side).
      // We don't have a separate "duplicate paper" row here, so we just log via paper_duplicates
      // as canonical=match.paperId, duplicate=match.paperId (self-link); skip if redundant.
      // For V1 we record the match method on a dummy duplicate row only when method != exact-id matches.
      // Simpler: only record on FUZZY_TITLE / NORMALIZED_TITLE matches (lower confidence).
      if (match.method === 'FUZZY_TITLE' || match.method === 'NORMALIZED_TITLE') {
        await duplicatesRepo.create({
          canonicalPaperId: paperId,
          duplicatePaperId: paperId,
          matchMethod: match.method,
          confidence: match.confidence,
        });
      }

      if (!(await sourcesRepo.exists(paperId, cand.source))) {
        await sourcesRepo.create({
          paperId,
          source: cand.source,
          sourceUrl: cand.sourceUrl,
          sourcePaperId: cand.sourcePaperId,
          pdfUrl: cand.pdfUrl,
        });
      }
      for (const alt of cand.additionalSources) {
        if (!(await sourcesRepo.exists(paperId, alt.source))) {
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

    await runResultsRepo.create({ runId: run.id, paperId, collectionStatus });

    if (cand.codeUrls.length) {
      await codeLinksRepo.addAll(paperId, cand.codeUrls);
    }

    if (cand.sourcePaperId) {
      paperIdByJoinKey.set(`${cand.source}:${cand.sourcePaperId}`, paperId);
    }
    for (const alt of cand.additionalSources) {
      paperIdByJoinKey.set(`${alt.source}:${alt.sourcePaperId}`, paperId);
    }
  }

  // ---------- Persist evaluations ----------
  const evalScoreByPaperId = new Map<string, number>();
  for (const e of evaluations) {
    const key = `${e.joinKey.source}:${e.joinKey.sourcePaperId}`;
    const paperId = paperIdByJoinKey.get(key);
    if (!paperId) continue;

    const recomputedTotal =
      e.scores.novelty +
      e.scores.methodologicalRigor +
      e.scores.experimentalQuality +
      e.scores.venueSourceCredibility +
      e.scores.authorInstitutionReputation;

    await evaluationsRepo.upsert({
      paperId,
      runId: run.id,
      evaluationStage: e.evaluationStage,
      llmModel: 'claude-code',
      llmPromptVersion: promptVersion,
      summary: e.summary,
      keyContribution: e.keyContribution,
      methodologySummary: e.methodologySummary,
      strengths: e.strengths,
      weaknesses: e.weaknesses,
      noveltyScore: e.scores.novelty,
      methodologicalRigorScore: e.scores.methodologicalRigor,
      experimentalQualityScore: e.scores.experimentalQuality,
      venueSourceCredibilityScore: e.scores.venueSourceCredibility,
      authorInstitutionReputationScore: e.scores.authorInstitutionReputation,
      totalScore: recomputedTotal,
      rankingExplanation: e.rankingExplanation,
      recommendationDecision: e.recommendationDecision,
      pdfAnalysisStatus: e.pdfAnalysisStatus,
      tableFigureAnalysis: e.tableFigureAnalysis,
    });
    await tagsRepo.addAll(paperId, e.tags, 'LLM_GENERATED');

    // Keep the highest-stage score for ranking (FULL_PDF wins over ABSTRACT_SCREENING)
    const prev = evalScoreByPaperId.get(paperId);
    if (prev === undefined || e.evaluationStage === 'FULL_PDF') {
      evalScoreByPaperId.set(paperId, recomputedTotal);
    }
  }

  // ---------- Compute final_rank + is_recommended ----------
  const sorted = [...evalScoreByPaperId.entries()].sort(([, a], [, b]) => b - a);
  let rank = 1;
  for (const [paperId] of sorted) {
    await runResultsRepo.updateRanking(run.id, paperId, rank, rank <= 10);
    rank++;
  }

  await runsRepo.setStatus(run.id, 'COMPLETED', true);

  const recommendedCount = Math.min(10, sorted.length);
  console.log(
    `Ingested ${candidates.length} papers (${newCount} new, ${existingCount} existing); ` +
      `${recommendedCount} recommended; run id ${run.id}`,
  );

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

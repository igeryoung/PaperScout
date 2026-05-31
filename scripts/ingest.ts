#!/usr/bin/env tsx
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { CandidatesFileSchema, type Candidate } from '@/server/schema/candidate';
import { EvaluationsFileSchema, type Evaluation } from '@/server/schema/evaluation';
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
import { ingestFigure } from './ingest/figures';
import {
  chooseRankingScore,
  rankPapers,
  recomputeTotal,
  type PaperEval,
} from './ingest/lib';

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

  const candidates: Candidate[] = candResult.data;
  const evaluations: Evaluation[] = evalResult.data;

  // ---------- Sanity: every evaluation joinKey matches a candidate ----------
  const candByKey = new Map<string, Candidate>();
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

  // ---------- Sanity: no duplicate evaluation rows for same paper + stage ----------
  // The join is candidate-keyed here; we'll re-check after dedup resolves to paperId.
  const evalsByJoinKeyAndStage = new Map<string, number>();
  for (const e of evaluations) {
    const k = `${e.joinKey.source}:${e.joinKey.sourcePaperId}:${e.evaluationStage}`;
    evalsByJoinKeyAndStage.set(k, (evalsByJoinKeyAndStage.get(k) ?? 0) + 1);
  }
  for (const [k, count] of evalsByJoinKeyAndStage) {
    if (count > 1) {
      console.error(`duplicate evaluation rows for ${k} (count=${count})`);
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
  const seenPaperId = new Set<string>();
  // Track per-paper {candidateOrder, joinKey} for ranking + fail-fast diagnostics.
  const paperMeta = new Map<string, { candidateOrder: number; joinKey: string }>();
  let newCount = 0;
  let existingCount = 0;
  let skipped = 0;

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
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
      // Two candidates in this batch resolved (via fuzzy match) to the same Paper.
      // Skip the duplicate run-result row to respect paper_run_results unique constraint.
      skipped++;
    } else {
      await runResultsRepo.create({ runId: run.id, paperId, collectionStatus });
      seenPaperId.add(paperId);
      const primaryKey = cand.sourcePaperId ? `${cand.source}:${cand.sourcePaperId}` : `paper:${paperId}`;
      paperMeta.set(paperId, { candidateOrder: i, joinKey: primaryKey });
    }

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

  // ---------- Persist evaluations + group by paperId for ranking ----------
  const evalsByPaperId = new Map<string, Evaluation[]>();
  const figureStats = { ok: 0, missing: 0, oversize: 0, error: 0 };

  for (const e of evaluations) {
    const key = `${e.joinKey.source}:${e.joinKey.sourcePaperId}`;
    const paperId = paperIdByJoinKey.get(key);
    if (!paperId) continue;

    const recomputedTotal = recomputeTotal(e.scores);

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
      recommendationReason: e.recommendationReason,
      recommendationDecision: e.recommendationDecision,
      pdfAnalysisStatus: e.pdfAnalysisStatus,
      tableFigureAnalysis: e.tableFigureAnalysis,
      digest: e.digest,
    });
    await tagsRepo.addAll(paperId, e.tags, 'LLM_GENERATED');

    if (e.figure) {
      const paper = await papersRepo.findById(paperId);
      const outcome = await ingestFigure({
        paperId,
        runDir,
        pdfUrl: paper?.pdfUrl ?? null,
        figure: e.figure,
      });
      figureStats[outcome]++;
    }

    const bucket = evalsByPaperId.get(paperId) ?? [];
    bucket.push(e);
    evalsByPaperId.set(paperId, bucket);
  }

  // ---------- Post-persist dedup check: same paperId + stage ----------
  // (catches the case where two candidates dedup to the same paper but each carried
  // an evaluation row for the same stage — the joinKey-level check above misses this.)
  for (const [paperId, evals] of evalsByPaperId) {
    const stages = new Set<string>();
    for (const e of evals) {
      if (stages.has(e.evaluationStage)) {
        const meta = paperMeta.get(paperId);
        console.error(
          `duplicate ${e.evaluationStage} evaluation for paper ${paperId} (joinKey ${meta?.joinKey ?? '?'})`,
        );
        process.exit(1);
      }
      stages.add(e.evaluationStage);
    }
  }

  // ---------- Fail-fast: every persisted paper must have an evaluation ----------
  // (Future `--allow-partial` flag could relax this; not implemented in Phase 3.)
  for (const [paperId, meta] of paperMeta) {
    if (!evalsByPaperId.has(paperId)) {
      console.error(
        `candidate ${meta.joinKey} (paperId ${paperId}) has no matching evaluation`,
      );
      process.exit(1);
    }
  }

  // ---------- Compute final_rank + is_recommended ----------
  const paperEvals: PaperEval[] = [];
  for (const [paperId, meta] of paperMeta) {
    paperEvals.push({
      paperId,
      candidateOrder: meta.candidateOrder,
      joinKey: meta.joinKey,
      evaluations: evalsByPaperId.get(paperId) ?? [],
    });
  }

  const scored = paperEvals
    .map((p) => chooseRankingScore(p))
    .filter((s): s is NonNullable<typeof s> => s !== null);
  const ranked = rankPapers(scored);

  for (const r of ranked) {
    await runResultsRepo.updateRanking(run.id, r.paperId, r.rank, r.isRecommended);
  }

  await runsRepo.setStatus(run.id, 'COMPLETED', true);

  const recommendedCount = ranked.filter((r) => r.isRecommended).length;
  console.log(
    `Ingested ${candidates.length} papers (${newCount} new, ${existingCount} existing, ${skipped} skipped); ` +
      `${recommendedCount} recommended; ` +
      `figures: ${figureStats.ok} ok / ${figureStats.missing} missing / ${figureStats.oversize} oversize / ${figureStats.error} error; ` +
      `run id ${run.id}`,
  );

  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});

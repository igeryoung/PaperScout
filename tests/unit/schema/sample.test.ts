import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CandidatesFileSchema } from '../../../src/server/schema/candidate';
import { EvaluationsFileSchema } from '../../../src/server/schema/evaluation';

describe('committed sample data', () => {
  it('data/sample/candidates.json passes CandidatesFileSchema', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../../data/sample/candidates.json'), 'utf8'),
    );
    const parsed = CandidatesFileSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(parsed.error.issues);
    }
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data.map((c) => c.sourcePaperId).sort()).toEqual([
        'RxWILaXuhb',
        'u6JLh0BO5h',
      ]);
      expect(parsed.data.every((c) => c.source === 'OPENREVIEW')).toBe(true);
    }
  });

  it('data/sample/evaluations.json passes EvaluationsFileSchema', () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, '../../../data/sample/evaluations.json'), 'utf8'),
    );
    const parsed = EvaluationsFileSchema.safeParse(raw);
    if (!parsed.success) {
      console.error(parsed.error.issues);
    }
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toHaveLength(2);
      expect(parsed.data.map((e) => e.joinKey.sourcePaperId).sort()).toEqual([
        'RxWILaXuhb',
        'u6JLh0BO5h',
      ]);
      // Total = sum of 5 dimensions (already enforced by schema; redundant but explicit)
      for (const e of parsed.data) {
        const sum =
          e.scores.novelty +
          e.scores.methodologicalRigor +
          e.scores.experimentalQuality +
          e.scores.venueSourceCredibility +
          e.scores.authorInstitutionReputation;
        expect(e.scores.total).toBe(sum);
        // Bilingual narrative fields must carry both locales.
        expect(e.summary.en.length).toBeGreaterThan(0);
        expect(e.summary['zh-TW'].length).toBeGreaterThan(0);
        expect(e.recommendationReason.en.length).toBeGreaterThan(0);
        expect(e.recommendationReason['zh-TW'].length).toBeGreaterThan(0);
        expect(e.rankingExplanation.en.length).toBeGreaterThan(0);
        expect(e.rankingExplanation['zh-TW'].length).toBeGreaterThan(0);
        if (e.figure) {
          expect(e.figure.caption.en.length).toBeGreaterThan(0);
          expect(e.figure.caption['zh-TW'].length).toBeGreaterThan(0);
          expect(e.figure.renderedPath).toMatch(/^figures\/.+\.png$/);
        }
        if (e.digest) {
          expect(e.digest.tldr.en.length).toBeGreaterThan(0);
          expect(e.digest.tldr['zh-TW'].length).toBeGreaterThan(0);
          expect(e.digest.experiments.mainResults.en.length).toBeGreaterThan(0);
          expect(e.digest.strengthsLimitations.limitations['zh-TW'].length).toBeGreaterThan(0);
        }
        if (e.strengths) {
          // List lengths should match across locales (skill guideline).
          expect(e.strengths.en.length).toBe(e.strengths['zh-TW'].length);
        }
        if (e.weaknesses) {
          expect(e.weaknesses.en.length).toBe(e.weaknesses['zh-TW'].length);
        }
      }
    }
  });
});

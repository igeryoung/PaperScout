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
      expect(parsed.data).toHaveLength(3);
      expect(parsed.data.map((c) => c.source).sort()).toEqual([
        'ARXIV',
        'HUGGINGFACE',
        'OPENREVIEW',
      ]);
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
      expect(parsed.data).toHaveLength(3);
      // Total = sum of 5 dimensions (already enforced by schema; redundant but explicit)
      for (const e of parsed.data) {
        const sum =
          e.scores.novelty +
          e.scores.methodologicalRigor +
          e.scores.experimentalQuality +
          e.scores.venueSourceCredibility +
          e.scores.authorInstitutionReputation;
        expect(e.scores.total).toBe(sum);
      }
    }
  });
});

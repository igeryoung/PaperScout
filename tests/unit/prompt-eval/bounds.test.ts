import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BoundsSchema } from '../../../scripts/prompt-eval/lib';

const FIXTURES = ['F1', 'F2', 'F3', 'F4', 'F5'];

describe('BoundsSchema', () => {
  for (const fid of FIXTURES) {
    it(`accepts the committed bounds.json for ${fid}`, () => {
      const path = resolve(__dirname, `../../../scripts/prompt-eval/fixtures/${fid}/bounds.json`);
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      const parsed = BoundsSchema.safeParse(raw);
      if (!parsed.success) {
        console.error(parsed.error.issues);
      }
      expect(parsed.success).toBe(true);
    });
  }

  it('accepts an empty object', () => {
    expect(BoundsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects unknown top-level keys', () => {
    const result = BoundsSchema.safeParse({ unknownKey: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects unknown dimension keys under scores', () => {
    const result = BoundsSchema.safeParse({
      scores: { madeUpDimension: { min: 5 } },
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-number min on a known dimension', () => {
    const result = BoundsSchema.safeParse({
      scores: { novelty: { min: 'high' } },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const path = result.error.issues[0]?.path.join('.') ?? '';
      expect(path).toContain('scores');
      expect(path).toContain('novelty');
      expect(path).toContain('min');
    }
  });

  it('requires at least one of min or max in a NumericRange', () => {
    const result = BoundsSchema.safeParse({ scores: { novelty: {} } });
    expect(result.success).toBe(false);
  });

  it('accepts an `in` array for recommendationDecision', () => {
    const result = BoundsSchema.safeParse({
      recommendationDecision: { in: ['RECOMMEND'] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts pdfAnalysisStatus null inside `in`', () => {
    const result = BoundsSchema.safeParse({
      pdfAnalysisStatus: { in: [null, 'SUCCESS'] },
    });
    expect(result.success).toBe(true);
  });
});

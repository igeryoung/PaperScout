import { describe, expect, it } from 'vitest';

import { formatSourceLabel } from '../../../src/lib/source-label';

const sourceLabels = {
  ARXIV: 'arXiv',
  OPENREVIEW: 'OpenReview',
  HUGGINGFACE: 'Hugging Face',
} as const;

describe('formatSourceLabel', () => {
  it('shows the conference without year for OpenReview papers with a venue', () => {
    expect(
      formatSourceLabel({
        source: 'OPENREVIEW',
        venue: 'ICLR 2026 Poster',
        sourceLabels,
      }),
    ).toBe('ICLR');
  });

  it('removes the year from non-acronym OpenReview venues', () => {
    expect(
      formatSourceLabel({
        source: 'OPENREVIEW',
        venue: 'Computer Vision, A Reference Guide 2014',
        sourceLabels,
      }),
    ).toBe('Computer Vision, A Reference Guide');
  });

  it('falls back to the provider label when an OpenReview venue is missing', () => {
    expect(
      formatSourceLabel({
        source: 'OPENREVIEW',
        venue: null,
        sourceLabels,
      }),
    ).toBe('OpenReview');
  });

  it('keeps non-OpenReview source labels unchanged', () => {
    expect(
      formatSourceLabel({
        source: 'ARXIV',
        venue: 'ICLR 2026',
        sourceLabels,
      }),
    ).toBe('arXiv');
  });
});

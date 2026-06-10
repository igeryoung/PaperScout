import type { Source } from '@prisma/client';

type SourceLabels = Record<Source, string>;

const CONFERENCE_ACRONYM_RE =
  /\b(AAAI|ACL|COLT|CVPR|ECCV|EMNLP|ICCV|ICLR|ICML|KDD|NAACL|NeurIPS|SIGIR|UAI|WACV|WWW)\b/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const OPENREVIEW_STATUS_RE =
  /\b(?:conference|poster|oral|spotlight|workshop|submitted to|withdrawn submission|rejected submission|submission)\b/gi;

/**
 * Returns the canonical top-conference acronym (e.g. `NEURIPS`, `CVPR`) when the
 * venue names one of the tracked top conferences, otherwise `null`. Used to
 * restrict statistics to top-conference papers only.
 */
export function matchConferenceAcronym(
  venue: string | null | undefined,
): string | null {
  const acronym = venue?.match(CONFERENCE_ACRONYM_RE)?.[1];
  return acronym ? acronym.toUpperCase() : null;
}

export function formatConferenceLabel(venue: string): string {
  const acronym = matchConferenceAcronym(venue);
  if (acronym) return acronym;

  return venue
    .replace(YEAR_RE, '')
    .replace(OPENREVIEW_STATUS_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatSourceLabel(input: {
  source: Source;
  venue?: string | null;
  sourceLabels: SourceLabels;
}): string {
  if (
    (input.source === 'OPENREVIEW' || input.source === 'OPENACCESS') &&
    input.venue?.trim()
  ) {
    return formatConferenceLabel(input.venue);
  }
  return input.sourceLabels[input.source];
}

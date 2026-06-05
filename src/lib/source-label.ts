import type { Source } from '@prisma/client';

type SourceLabels = Record<Source, string>;

const CONFERENCE_ACRONYM_RE =
  /\b(AAAI|ACL|COLT|CVPR|ECCV|EMNLP|ICCV|ICLR|ICML|KDD|NAACL|NeurIPS|SIGIR|UAI|WACV|WWW)\b/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/g;
const OPENREVIEW_STATUS_RE =
  /\b(?:conference|poster|oral|spotlight|workshop|submitted to|withdrawn submission|rejected submission|submission)\b/gi;

export function formatConferenceLabel(venue: string): string {
  const acronym = venue.match(CONFERENCE_ACRONYM_RE)?.[1];
  if (acronym) return acronym.toUpperCase();

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

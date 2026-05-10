/**
 * Normalize a paper title for fingerprinting and fuzzy matching.
 *
 * Steps:
 *   1. Unicode NFKD normalize
 *   2. Strip combining marks (diacritics)
 *   3. Lowercase
 *   4. Replace non-alphanumeric with single space
 *   5. Collapse multiple whitespace
 *   6. Trim
 *
 * Pure / deterministic — same input always produces same output.
 */
export function normalizeTitle(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAuthor(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

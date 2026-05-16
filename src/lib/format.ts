// Small display helpers shared by Phase 4 pages and components.

const DATE_FMT = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

export function formatDate(d: Date | null | undefined): string {
  return d ? DATE_FMT.format(d) : '—';
}

export function authorsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

export function formatAuthors(value: unknown, maxAuthors = Infinity): string {
  const authors = authorsFromJson(value);
  if (authors.length === 0) return '—';
  if (authors.length <= maxAuthors) return authors.join(', ');
  return `${authors.slice(0, maxAuthors).join(', ')}, et al.`;
}

export function stringsFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

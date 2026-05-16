import type { RunSummary } from '@/server/repos/trends';

interface TrendSummaryProps {
  summary: RunSummary;
}

interface StatProps {
  label: string;
  value: string | number;
  hint?: string;
}

function Stat({ label, value, hint }: StatProps) {
  return (
    <div className="bg-card flex min-w-[120px] flex-1 flex-col rounded-md border px-4 py-3">
      <div className="text-muted-foreground text-xs uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-muted-foreground mt-0.5 text-xs">{hint}</div> : null}
    </div>
  );
}

export function TrendSummary({ summary }: TrendSummaryProps) {
  const topSource = summary.sources[0];
  const topSourceLabel = topSource
    ? `${topSource.source} · ${topSource.count}`
    : '—';
  const median =
    summary.scoreStats !== null ? `${summary.scoreStats.median} / 100` : '—';
  const pdf = summary.pdfStatus;
  const pdfHint = `${pdf.success} ok · ${pdf.failed + pdf.unavailable} unavail · ${pdf.none} abstract`;

  return (
    <div className="flex flex-wrap gap-3">
      <Stat label="Papers" value={summary.totalPapers} />
      <Stat label="Recommended" value={summary.recommendedCount} />
      <Stat label="Median score" value={median} />
      <Stat label="PDF analysis" value={pdf.success} hint={pdfHint} />
      <Stat label="Top source" value={topSourceLabel} />
    </div>
  );
}

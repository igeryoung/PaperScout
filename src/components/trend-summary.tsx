import type { RunSummary } from '@/server/repos/trends';
import type { Messages } from '@/i18n';

interface TrendSummaryProps {
  summary: RunSummary;
  messages: Messages;
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

export function TrendSummary({ summary, messages }: TrendSummaryProps) {
  const t = messages.trendSummary;
  const sourceLabels = messages.common.sources;
  const topSource = summary.sources[0];
  const topSourceLabel = topSource
    ? `${sourceLabels[topSource.source]} · ${topSource.count}`
    : messages.common.dash;
  const median =
    summary.scoreStats !== null ? `${summary.scoreStats.median} / 100` : messages.common.dash;
  const pdf = summary.pdfStatus;
  const pdfHint = t.pdfHint(pdf.success, pdf.failed + pdf.unavailable, pdf.none);

  return (
    <div className="flex flex-wrap gap-3">
      <Stat label={t.papers} value={summary.totalPapers} />
      <Stat label={t.recommended} value={summary.recommendedCount} />
      <Stat label={t.medianScore} value={median} />
      <Stat label={t.pdfAnalysis} value={pdf.success} hint={pdfHint} />
      <Stat label={t.topSource} value={topSourceLabel} />
    </div>
  );
}

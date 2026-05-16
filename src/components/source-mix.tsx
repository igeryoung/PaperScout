import type { Source } from '@prisma/client';
import type { SourceCount } from '@/server/repos/trends';

interface SourceMixProps {
  sources: SourceCount[];
}

const SOURCE_COLORS: Record<Source, string> = {
  ARXIV: 'bg-sky-500',
  OPENREVIEW: 'bg-violet-500',
  HUGGINGFACE: 'bg-amber-500',
};

const SOURCE_LABELS: Record<Source, string> = {
  ARXIV: 'arXiv',
  OPENREVIEW: 'OpenReview',
  HUGGINGFACE: 'Hugging Face',
};

export function SourceMix({ sources }: SourceMixProps) {
  const total = sources.reduce((acc, s) => acc + s.count, 0);
  if (total === 0) {
    return <p className="text-muted-foreground text-sm">No sources yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="bg-muted flex h-3 w-full overflow-hidden rounded-full">
        {sources.map((s) =>
          s.count > 0 ? (
            <div
              key={s.source}
              className={SOURCE_COLORS[s.source]}
              style={{ width: `${(s.count / total) * 100}%` }}
              title={`${SOURCE_LABELS[s.source]}: ${s.count}`}
            />
          ) : null,
        )}
      </div>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {sources.map((s) => (
          <li key={s.source} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${SOURCE_COLORS[s.source]}`} />
            <span className="text-foreground">{SOURCE_LABELS[s.source]}</span>
            <span className="tabular-nums">{s.count}</span>
            <span>({Math.round((s.count / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

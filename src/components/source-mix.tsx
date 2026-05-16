import type { Source } from '@prisma/client';
import type { SourceCount } from '@/server/repos/trends';
import type { Messages } from '@/i18n';

interface SourceMixProps {
  sources: SourceCount[];
  messages: Messages;
}

const SOURCE_COLORS: Record<Source, string> = {
  ARXIV: 'bg-sky-500',
  OPENREVIEW: 'bg-violet-500',
  HUGGINGFACE: 'bg-amber-500',
};

export function SourceMix({ sources, messages }: SourceMixProps) {
  const total = sources.reduce((acc, s) => acc + s.count, 0);
  const sourceLabels = messages.common.sources;
  if (total === 0) {
    return <p className="text-muted-foreground text-sm">{messages.sourceMix.empty}</p>;
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
              title={`${sourceLabels[s.source]}: ${s.count}`}
            />
          ) : null,
        )}
      </div>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {sources.map((s) => (
          <li key={s.source} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${SOURCE_COLORS[s.source]}`} />
            <span className="text-foreground">{sourceLabels[s.source]}</span>
            <span className="tabular-nums">{s.count}</span>
            <span>({Math.round((s.count / total) * 100)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

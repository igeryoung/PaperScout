import type { PaperEvaluation } from '@prisma/client';
import { scoreTier, type ScoreTier } from '@/server/lib/select-evaluation';

interface ScoreBreakdownProps {
  evaluation: PaperEvaluation;
}

const DIMENSIONS: Array<{
  label: string;
  max: number;
  field: keyof Pick<
    PaperEvaluation,
    | 'noveltyScore'
    | 'methodologicalRigorScore'
    | 'experimentalQualityScore'
    | 'venueSourceCredibilityScore'
    | 'authorInstitutionReputationScore'
  >;
}> = [
  { label: 'Novelty', max: 25, field: 'noveltyScore' },
  { label: 'Methodological rigor', max: 25, field: 'methodologicalRigorScore' },
  { label: 'Experimental quality', max: 20, field: 'experimentalQualityScore' },
  { label: 'Venue / source credibility', max: 15, field: 'venueSourceCredibilityScore' },
  { label: 'Author / institution reputation', max: 15, field: 'authorInstitutionReputationScore' },
];

const TIER_BG: Record<ScoreTier, string> = {
  good: 'bg-emerald-500',
  mid: 'bg-amber-500',
  weak: 'bg-rose-500',
};

export function ScoreBreakdown({ evaluation }: ScoreBreakdownProps) {
  const totalTier = scoreTier(evaluation.totalScore, 100);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">Total score</span>
        <span className={`text-xl font-semibold tabular-nums`}>
          <span
            className={
              totalTier === 'good'
                ? 'text-emerald-600 dark:text-emerald-400'
                : totalTier === 'mid'
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-rose-600 dark:text-rose-400'
            }
          >
            {evaluation.totalScore}
          </span>
          <span className="text-muted-foreground"> / 100</span>
        </span>
      </div>
      <div className="space-y-2">
        {DIMENSIONS.map((d) => {
          const value = evaluation[d.field];
          const pct = d.max > 0 ? (value / d.max) * 100 : 0;
          const tier = scoreTier(value, d.max);
          return (
            <div key={d.field} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span>{d.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {value} / {d.max}
                </span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className={`h-full ${TIER_BG[tier]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

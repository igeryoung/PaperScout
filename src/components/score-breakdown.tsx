import type { PaperEvaluation } from '@prisma/client';
import { scoreTier, type ScoreTier } from '@/server/lib/select-evaluation';
import type { Messages } from '@/i18n';

interface ScoreBreakdownProps {
  evaluation: PaperEvaluation;
  messages: Messages;
}

type ScoreField = keyof Pick<
  PaperEvaluation,
  | 'noveltyScore'
  | 'methodologicalRigorScore'
  | 'experimentalQualityScore'
  | 'venueSourceCredibilityScore'
  | 'authorInstitutionReputationScore'
>;

const DIMENSION_DEFS: Array<{ key: keyof Messages['scoreBreakdown']; max: number; field: ScoreField }> = [
  { key: 'novelty', max: 25, field: 'noveltyScore' },
  { key: 'methodologicalRigor', max: 25, field: 'methodologicalRigorScore' },
  { key: 'experimentalQuality', max: 20, field: 'experimentalQualityScore' },
  { key: 'venueSourceCredibility', max: 15, field: 'venueSourceCredibilityScore' },
  { key: 'authorInstitutionReputation', max: 15, field: 'authorInstitutionReputationScore' },
];

const TIER_BG: Record<ScoreTier, string> = {
  good: 'bg-emerald-500',
  mid: 'bg-amber-500',
  weak: 'bg-rose-500',
};

export function ScoreBreakdown({ evaluation, messages }: ScoreBreakdownProps) {
  const t = messages.scoreBreakdown;
  const totalTier = scoreTier(evaluation.totalScore, 100);
  const totalColor =
    totalTier === 'good'
      ? 'text-emerald-600'
      : totalTier === 'mid'
        ? 'text-amber-600'
        : 'text-rose-600';
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]">
          {t.total}
        </h3>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className={`text-3xl font-extrabold tabular-nums ${totalColor}`}>
            {evaluation.totalScore}
          </span>
          <span className="text-sm font-semibold text-[#98a2b3]">/ 100</span>
        </div>
      </div>
      <div className="space-y-2.5">
        {DIMENSION_DEFS.map((d) => {
          const value = evaluation[d.field];
          const pct = d.max > 0 ? (value / d.max) * 100 : 0;
          const tier = scoreTier(value, d.max);
          return (
            <div key={d.field} className="space-y-1">
              <div className="flex items-baseline justify-between text-[12px]">
                <span className="text-[#475467]">{t[d.key]}</span>
                <span className="font-semibold tabular-nums text-[#667085]">
                  {value} / {d.max}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#eef0f6]">
                <div className={`h-full rounded-full ${TIER_BG[tier]}`} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

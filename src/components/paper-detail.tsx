import type { PaperEvaluation } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { Separator } from '@/components/ui/separator';
import type { PaperWithDetail } from '@/server/repos/papers';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { formatAuthors, formatDate } from '@/lib/format';
import { pickLocalized, pickLocalizedList, type Locale } from '@/lib/locale';
import type { Messages } from '@/i18n';

interface PaperDetailProps {
  paper: PaperWithDetail;
  locale: Locale;
  messages: Messages;
}

function StageBadge({
  evaluation,
  messages,
}: {
  evaluation: PaperEvaluation;
  messages: Messages;
}) {
  const stage =
    evaluation.evaluationStage === 'FULL_PDF'
      ? messages.paperDetail.stageFullPdf
      : messages.paperDetail.stageAbstract;
  if (evaluation.evaluationStage === 'FULL_PDF') {
    const status = evaluation.pdfAnalysisStatus ?? 'UNAVAILABLE';
    return (
      <Badge variant="outline" className="font-normal">
        {stage} · {status}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="font-normal">
      {stage}
    </Badge>
  );
}

export function PaperDetail({ paper, locale, messages }: PaperDetailProps) {
  const evaluation = selectBestEvaluation(paper.evaluations);
  const summary = pickLocalized(evaluation?.summary, locale);
  const reason = pickLocalized(evaluation?.recommendationReason, locale);
  const rankingExplanation = pickLocalized(evaluation?.rankingExplanation, locale);
  const keyContribution = pickLocalized(evaluation?.keyContribution, locale);
  const methodologySummary = pickLocalized(evaluation?.methodologySummary, locale);
  const strengths = evaluation ? pickLocalizedList(evaluation.strengths, locale) : [];
  const weaknesses = evaluation ? pickLocalizedList(evaluation.weaknesses, locale) : [];
  const figureCaption = pickLocalized(paper.figure?.caption, locale);
  const sourceLabels = messages.common.sources;
  const t = messages.paperDetail;

  return (
    <article className="space-y-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{sourceLabels[paper.primarySource]}</Badge>
          {evaluation ? <StageBadge evaluation={evaluation} messages={messages} /> : null}
          {evaluation?.recommendationDecision ? (
            <Badge
              variant={
                evaluation.recommendationDecision === 'RECOMMEND' ? 'default' : 'outline'
              }
            >
              {messages.common.decisions[evaluation.recommendationDecision]}
            </Badge>
          ) : null}
        </div>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight">{paper.title}</h1>
        <p className="text-muted-foreground text-sm">
          {formatAuthors(paper.authors)}
          <span className="mx-2">·</span>
          {t.publishedPrefix} {formatDate(paper.publishedDate)}
          {paper.venue ? (
            <>
              <span className="mx-2">·</span>
              {paper.venue}
            </>
          ) : null}
        </p>
        {paper.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {paper.tags.map((t) => (
              <Badge key={t.id} variant="outline" className="font-normal">
                {t.tag}
              </Badge>
            ))}
          </div>
        ) : null}
      </header>

      {paper.figure ? (
        <figure className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- served from
              our own /api/papers/[id]/figure route. */}
          <img
            src={`/api/papers/${paper.id}/figure`}
            alt={
              paper.figure.figureLabel
                ? `${paper.figure.figureLabel}${figureCaption ? `: ${figureCaption}` : ''}`
                : t.figureFallback
            }
            loading="eager"
            decoding="async"
            className="bg-muted mx-auto max-h-[28rem] w-auto max-w-full rounded-md border object-contain"
          />
          {figureCaption ? (
            <figcaption className="text-muted-foreground text-center text-xs leading-relaxed">
              {paper.figure.figureLabel ? (
                <span className="font-medium">{paper.figure.figureLabel}</span>
              ) : null}
              {paper.figure.figureLabel && figureCaption ? ' · ' : ''}
              {figureCaption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {evaluation ? (
        <section className="bg-card rounded-lg border p-6">
          <ScoreBreakdown evaluation={evaluation} messages={messages} />
        </section>
      ) : null}

      {summary ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{t.summary}</h2>
          <p className="leading-relaxed">{summary}</p>
        </section>
      ) : null}

      {reason ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">
            {t.whyRecommended}
          </h2>
          <p className="text-muted-foreground border-l-2 pl-3 italic leading-relaxed">
            {reason}
          </p>
        </section>
      ) : null}

      {rankingExplanation ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{t.rankingNote}</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {rankingExplanation}
          </p>
        </section>
      ) : null}

      {paper.abstract ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{t.abstract}</h2>
          <p className="leading-relaxed">{paper.abstract}</p>
        </section>
      ) : null}

      {keyContribution ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{t.keyContribution}</h2>
          <p className="leading-relaxed">{keyContribution}</p>
        </section>
      ) : null}

      {methodologySummary ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{t.methodology}</h2>
          <p className="leading-relaxed">{methodologySummary}</p>
        </section>
      ) : null}

      {strengths.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{t.strengths}</h2>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {weaknesses.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">{t.weaknesses}</h2>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            {weaknesses.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Separator />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide">{t.links}</h2>
        <ul className="space-y-1.5 text-sm">
          {paper.pdfUrl ? (
            <li>
              <a
                href={paper.pdfUrl}
                className="hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {messages.common.pdf}
              </a>
            </li>
          ) : null}
          {paper.sources.map((s) => (
            <li key={s.id}>
              <a
                href={s.sourceUrl}
                className="hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {sourceLabels[s.source]}: {s.sourceUrl} ↗
              </a>
            </li>
          ))}
          {paper.codeLinks.map((c) => (
            <li key={c.id}>
              <a
                href={c.codeUrl}
                className="hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                {messages.common.code}: {c.codeUrl}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

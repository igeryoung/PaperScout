import Link from 'next/link';
import type { PaperCodeLink, PaperSource, PaperTag } from '@prisma/client';
import type { PaperCardEvaluation } from '@/server/repos/papers';

import { Badge } from '@/components/ui/badge';
import { formatAuthors, formatDate } from '@/lib/format';
import { pickLocalized, type Locale } from '@/lib/locale';
import { formatSourceLabel } from '@/lib/source-label';
import type { Messages } from '@/i18n';

export interface PaperCardPaper {
  id: string;
  title: string;
  authors: unknown;
  primarySource: PaperSource['source'];
  venue: string | null;
  publishedDate: Date | null;
  pdfUrl: string | null;
  sources: Array<Pick<PaperSource, 'source' | 'sourceUrl'>>;
  tags: Array<Pick<PaperTag, 'id' | 'tag'>>;
  codeLinks: Array<Pick<PaperCodeLink, 'id' | 'codeUrl'>>;
  figure: {
    caption: unknown;
    figureLabel: string | null;
  } | null;
}

interface PaperCardProps {
  rank: number | null;
  paper: PaperCardPaper;
  evaluation: PaperCardEvaluation | null;
  locale: Locale;
  messages: Messages;
}

function StageBadge({
  evaluation,
  messages,
}: {
  evaluation: PaperCardEvaluation;
  messages: Messages;
}) {
  const stage =
    evaluation.evaluationStage === 'FULL_PDF'
      ? messages.paperCard.stageFullPdf
      : messages.paperCard.stageAbstract;
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

function findSourceLink(paper: PaperCardPaper, source: PaperSource['source']): string | null {
  const row = paper.sources.find((s) => s.source === source);
  return row?.sourceUrl ?? null;
}

export function PaperCard({ rank, paper, evaluation, locale, messages }: PaperCardProps) {
  const arxivUrl = findSourceLink(paper, 'ARXIV');
  const openReviewUrl = findSourceLink(paper, 'OPENREVIEW');
  const huggingFaceUrl = findSourceLink(paper, 'HUGGINGFACE');
  const visibleTags = paper.tags.slice(0, 5);
  const hiddenTagCount = paper.tags.length - visibleTags.length;
  const summary = pickLocalized(evaluation?.summary, locale);
  const reason = pickLocalized(evaluation?.recommendationReason, locale);
  const sourceLabels = messages.common.sources;
  const primarySourceLabel = formatSourceLabel({
    source: paper.primarySource,
    venue: paper.venue,
    sourceLabels,
  });

  return (
    <article className="bg-card rounded-lg border p-5 shadow-sm">
      <div className="flex items-start gap-4">
        {rank !== null ? (
          <div className="text-muted-foreground w-8 shrink-0 text-2xl font-semibold tabular-nums">
            {rank}
          </div>
        ) : null}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-lg leading-tight font-semibold tracking-tight">
                <Link href={`/papers/${paper.id}`} className="hover:underline">
                  {paper.title}
                </Link>
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {formatAuthors(paper.authors, 3)}
                <span className="mx-2">·</span>
                {formatDate(paper.publishedDate)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{primarySourceLabel}</Badge>
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
            {visibleTags.map((t) => (
              <Badge key={t.id} variant="outline" className="font-normal">
                {t.tag}
              </Badge>
            ))}
            {hiddenTagCount > 0 ? (
              <span className="text-muted-foreground text-xs">+{hiddenTagCount}</span>
            ) : null}
          </div>

          {summary ? (
            <p className="text-foreground line-clamp-3 text-sm leading-relaxed">{summary}</p>
          ) : null}

          {reason ? (
            <p className="text-foreground border-l-2 border-emerald-400 pl-3 text-[15px] leading-relaxed line-clamp-4">
              {reason}
            </p>
          ) : null}

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {paper.pdfUrl ? (
              <a
                href={paper.pdfUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                {messages.common.pdf}
              </a>
            ) : null}
            {arxivUrl ? (
              <a
                href={arxivUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                {sourceLabels.ARXIV} ↗
              </a>
            ) : null}
            {openReviewUrl ? (
              <a
                href={openReviewUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                {sourceLabels.OPENREVIEW} ↗
              </a>
            ) : null}
            {huggingFaceUrl ? (
              <a
                href={huggingFaceUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                {sourceLabels.HUGGINGFACE} ↗
              </a>
            ) : null}
            {paper.codeLinks.map((c) => (
              <a
                key={c.id}
                href={c.codeUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                {messages.common.code}
              </a>
            ))}
          </div>
        </div>
        <PaperFigureThumb paper={paper} locale={locale} messages={messages} />
      </div>
    </article>
  );
}

function PaperFigureThumb({
  paper,
  locale,
  messages,
}: {
  paper: PaperCardPaper;
  locale: Locale;
  messages: Messages;
}) {
  if (!paper.figure) {
    return (
      <div
        aria-hidden
        className="bg-muted/40 hidden h-28 w-40 shrink-0 rounded-md border border-dashed sm:block"
      />
    );
  }
  const labelPart = paper.figure.figureLabel ?? messages.paperCard.figureFallback;
  const captionText = pickLocalized(paper.figure.caption, locale);
  const captionPart = captionText ? `: ${captionText}` : '';
  return (
    // Served from our own /api/papers/[id]/figure route; next/image
    // optimization is not needed for a small, cache-controlled thumbnail.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/papers/${paper.id}/figure`}
      alt={`${labelPart}${captionPart}`}
      loading="lazy"
      decoding="async"
      className="bg-muted hidden h-28 w-40 shrink-0 rounded-md border object-cover sm:block"
    />
  );
}

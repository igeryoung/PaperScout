import Link from 'next/link';
import { Lightbulb } from 'lucide-react';
import type { PaperSource } from '@prisma/client';
import type { PaperCardEvaluation, PaperCardPayload } from '@/server/repos/papers';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { formatAuthors, formatDate, formatDateISO } from '@/lib/format';
import { pickLocalized, type Locale } from '@/lib/locale';
import { formatSourceLabel } from '@/lib/source-label';
import type { Messages } from '@/i18n';
import { HomePaperActions } from '@/components/home-paper-actions';
import { HomeFigurePreview } from '@/components/home-figure-preview';
import { HomeSummaryDialog } from '@/components/home-summary-dialog';

export type PaperFeedCardProps = {
  paper: PaperCardPayload;
  index: number;
  locale: Locale;
  messages: Messages;
  /** Render the green "why recommended" panel (per-run judgment). */
  showReason?: boolean;
  /** Render the favorite / read-later actions (needs a signed-in session). */
  showActions?: boolean;
  userState?: { liked: boolean; readLater: boolean };
};

function findSourceLink(paper: PaperCardPayload, source: PaperSource['source']) {
  return paper.sources.find((s) => s.source === source)?.sourceUrl ?? null;
}

function PlaceholderThumb({ index }: { index: number }) {
  if (index % 2 === 0) {
    return (
      <div className="relative h-44 min-h-44 overflow-hidden rounded-lg border border-[#dce3ef] bg-[#fbfcff]">
        <span className="absolute top-[65px] left-6 grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-white text-[10px] text-[#344054]">
          Query
        </span>
        <span className="absolute top-[108px] left-[88px] grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-white text-[10px] text-[#344054]">
          Docs
        </span>
        <span className="absolute top-[83px] left-[135px] grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-[#dff5df] text-[10px] text-[#344054]">
          Model
        </span>
        <span className="absolute top-[83px] left-[208px] grid min-h-[38px] min-w-[58px] place-items-center rounded border border-[#8ba0b8] bg-[#d9edff] text-[10px] text-[#344054]">
          LLM
        </span>
        <span className="absolute top-[84px] left-[79px] h-0.5 w-[55px] bg-[#98a2b3] after:absolute after:top-[-4px] after:right-[-1px] after:border-y-[5px] after:border-l-[7px] after:border-y-transparent after:border-l-[#98a2b3]" />
      </div>
    );
  }

  return (
    <div className="grid h-44 min-h-44 grid-cols-3 gap-3 overflow-hidden rounded-lg border border-[#dce3ef] bg-[#fbfcff] p-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="relative min-h-[68px] border-b border-l border-[#ccd5e2] bg-[linear-gradient(#eef2f8_1px,transparent_1px),linear-gradient(90deg,#eef2f8_1px,transparent_1px)] bg-[length:100%_18px,22px_100%] before:absolute before:inset-[10px_9px_11px] before:border-t-[3px] before:border-[#5b7cff]"
        />
      ))}
      <div className="col-span-3 grid grid-cols-4 gap-2">
        {[0, 1, 2, 3].map((i) => (
          <i
            key={i}
            className="min-h-[42px] rounded-[5px] bg-[radial-gradient(circle_at_30%_30%,#f7d38d_0_15%,transparent_16%),radial-gradient(circle_at_70%_50%,#82c7a5_0_18%,transparent_19%),linear-gradient(135deg,#bdc8e7,#f1f4fb)]"
          />
        ))}
      </div>
    </div>
  );
}

function PaperThumb({
  paper,
  index,
  locale,
  messages,
}: {
  paper: PaperCardPayload;
  index: number;
  locale: Locale;
  messages: Messages;
}) {
  if (!paper.figure) return <PlaceholderThumb index={index} />;
  const labelPart = paper.figure.figureLabel ?? messages.home.cardFigureFallback;
  const captionText = pickLocalized(paper.figure.caption, locale);
  const captionPart = captionText ? `: ${captionText}` : '';
  return (
    <HomeFigurePreview
      src={`/api/papers/${paper.id}/figure`}
      alt={`${labelPart}${captionPart}`}
    />
  );
}

function ExternalLinks({
  paper,
  evaluation,
  summary,
  metaLine,
  messages,
}: {
  paper: PaperCardPayload;
  evaluation: PaperCardEvaluation | null;
  summary: string;
  metaLine: string;
  messages: Messages;
}) {
  const arxivUrl = findSourceLink(paper, 'ARXIV');
  const openReviewUrl = findSourceLink(paper, 'OPENREVIEW');
  const huggingFaceUrl = findSourceLink(paper, 'HUGGINGFACE');
  const firstExternal =
    paper.pdfUrl ?? arxivUrl ?? openReviewUrl ?? huggingFaceUrl ?? paper.codeLinks[0]?.codeUrl;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] font-bold text-[#392ee5] xl:justify-end">
      <HomeSummaryDialog
        href={`/papers/${paper.id}`}
        title={paper.title}
        meta={metaLine}
        summary={summary}
        abstract={paper.abstract}
        triggerLabel={messages.home.cardViewSummary}
        aiLabel={messages.home.cardSummaryDialogAiLabel}
        abstractLabel={messages.home.cardSummaryDialogAbstractLabel}
        emptyLabel={messages.home.cardSummaryDialogEmpty}
        viewFullLabel={messages.home.cardSummaryDialogViewFull}
      />
      {firstExternal ? (
        <a href={firstExternal} target="_blank" rel="noreferrer">
          {messages.home.cardOpenPaper}
        </a>
      ) : evaluation ? (
        <span>{evaluation.evaluationStage}</span>
      ) : null}
    </div>
  );
}

export function PaperFeedCard({
  paper,
  index,
  locale,
  messages,
  showReason = true,
  showActions = true,
  userState,
}: PaperFeedCardProps) {
  const evaluation = selectBestEvaluation(paper.evaluations);
  const sourceLabels = messages.common.sources;
  const summary = pickLocalized(evaluation?.summary, locale) ?? messages.home.summaryFallback;
  const reason =
    pickLocalized(evaluation?.recommendationReason, locale) ?? messages.home.reasonFallback;
  const primarySourceLabel = formatSourceLabel({
    source: paper.primarySource,
    venue: paper.venue,
    sourceLabels,
  });
  const metaLine = [
    formatAuthors(paper.authors, 3),
    primarySourceLabel,
    formatDate(paper.publishedDate),
  ].join(' · ');

  return (
    <article className="grid grid-cols-1 items-stretch gap-4 rounded-[10px] border border-[#dfe5ee] bg-white p-4 shadow-[0_10px_30px_rgba(29,41,57,0.05)] xl:grid-cols-[280px_minmax(0,1fr)]">
      <div className="min-w-0">
        <PaperThumb paper={paper} index={index} locale={locale} messages={messages} />
      </div>

      <div className="min-w-0">
        <h2 className="mb-2 text-lg leading-snug font-semibold tracking-normal text-[#111827]">
          <Link href={`/papers/${paper.id}`} className="hover:text-[#392ee5]">
            {paper.title}
          </Link>
        </h2>
        <div className="mb-3 flex flex-wrap gap-2 text-[13px] text-[#667085]">
          <span>{formatAuthors(paper.authors, 3)}</span>
          <span>|</span>
          <span>{primarySourceLabel}</span>
          <span>|</span>
          <span>{formatDate(paper.publishedDate)}</span>
        </div>
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
          <p className="text-sm leading-relaxed text-[#273142]">{summary}</p>
          {showReason ? (
            <div className="flex min-h-[120px] flex-col rounded-lg bg-[#eaf8f4] px-4 py-3.5 text-sm leading-relaxed text-[#195b50]">
              <strong className="mb-2 flex items-center gap-2 text-[13px] text-[#0f9f86]">
                <Lightbulb aria-hidden className="h-4 w-4" />
                {messages.home.cardReasonHeader}
              </strong>
              <span className="flex-1 overflow-hidden">{reason}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 border-t border-[#edf1f7] pt-3 xl:col-span-2 xl:grid-cols-[280px_minmax(0,6fr)_minmax(0,4fr)] xl:items-start">
        {paper.tags.length > 0 ? (
          <div className="paper-tag-marquee overflow-hidden py-0.5">
            <div className="paper-tag-marquee__track flex w-max gap-2">
              {[false, true].map((isDuplicate) => (
                <div
                  key={isDuplicate ? 'duplicate' : 'primary'}
                  aria-hidden={isDuplicate}
                  className="flex shrink-0 gap-2"
                >
                  {paper.tags.map((tag) => (
                    <Link
                      key={`${isDuplicate ? 'duplicate' : 'primary'}-${tag.id}`}
                      href={`/library?tags=${encodeURIComponent(tag.tag)}`}
                      tabIndex={isDuplicate ? -1 : undefined}
                      className="inline-flex min-h-[26px] shrink-0 items-center rounded-full bg-[#eef0ff] px-3 text-[13px] font-bold whitespace-nowrap text-[#3442c8]"
                    >
                      {tag.tag}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div aria-hidden />
        )}
        <div className="flex flex-wrap items-center gap-3">
          {showActions ? (
            <HomePaperActions
              paperId={paper.id}
              initialLiked={userState?.liked ?? false}
              initialReadLater={userState?.readLater ?? false}
              favoriteLabel={messages.home.cardFavorite}
              readLaterLabel={messages.home.cardReadLater}
            />
          ) : null}
          <span className="text-[13px] text-[#667085]">
            {messages.home.cardPublishDate(formatDateISO(paper.createdAt))}
          </span>
        </div>
        <ExternalLinks
          paper={paper}
          evaluation={evaluation}
          summary={summary}
          metaLine={metaLine}
          messages={messages}
        />
      </div>
    </article>
  );
}

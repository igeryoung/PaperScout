import Link from 'next/link';
import type {
  PaperEvaluation,
  PaperCodeLink,
  PaperSource,
  PaperTag,
} from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { formatAuthors, formatDate } from '@/lib/format';
import { scoreTier, type ScoreTier } from '@/server/lib/select-evaluation';

export interface PaperCardPaper {
  id: string;
  title: string;
  authors: unknown;
  primarySource: PaperSource['source'];
  publishedDate: Date | null;
  pdfUrl: string | null;
  sources: PaperSource[];
  tags: PaperTag[];
  codeLinks: PaperCodeLink[];
  figure: {
    caption: string | null;
    figureLabel: string | null;
  } | null;
}

interface PaperCardProps {
  rank: number | null;
  paper: PaperCardPaper;
  evaluation: PaperEvaluation | null;
}

const STAGE_LABEL: Record<PaperEvaluation['evaluationStage'], string> = {
  ABSTRACT_SCREENING: 'Abstract',
  FULL_PDF: 'Full PDF',
};

const TIER_TEXT: Record<ScoreTier, string> = {
  good: 'text-emerald-600 dark:text-emerald-400',
  mid: 'text-amber-600 dark:text-amber-400',
  weak: 'text-rose-600 dark:text-rose-400',
};

const TIER_BG: Record<ScoreTier, string> = {
  good: 'bg-emerald-500',
  mid: 'bg-amber-500',
  weak: 'bg-rose-500',
};

const SOURCE_LABEL: Record<PaperSource['source'], string> = {
  ARXIV: 'arXiv',
  OPENREVIEW: 'OpenReview',
  HUGGINGFACE: 'Hugging Face',
};

function StageBadge({ evaluation }: { evaluation: PaperEvaluation }) {
  const stage = STAGE_LABEL[evaluation.evaluationStage];
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

export function PaperCard({ rank, paper, evaluation }: PaperCardProps) {
  const total = evaluation?.totalScore ?? null;
  const tier = total !== null ? scoreTier(total, 100) : null;
  const arxivUrl = findSourceLink(paper, 'ARXIV');
  const openReviewUrl = findSourceLink(paper, 'OPENREVIEW');
  const huggingFaceUrl = findSourceLink(paper, 'HUGGINGFACE');
  const visibleTags = paper.tags.slice(0, 5);
  const hiddenTagCount = paper.tags.length - visibleTags.length;

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
            {total !== null && tier ? (
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className={`text-lg font-semibold tabular-nums ${TIER_TEXT[tier]}`}>
                  {total}
                  <span className="text-muted-foreground text-sm font-normal"> / 100</span>
                </div>
                <div className="bg-muted h-1.5 w-32 overflow-hidden rounded-full">
                  <div className={`h-full ${TIER_BG[tier]}`} style={{ width: `${total}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{SOURCE_LABEL[paper.primarySource]}</Badge>
            {evaluation ? <StageBadge evaluation={evaluation} /> : null}
            {evaluation?.recommendationDecision ? (
              <Badge
                variant={
                  evaluation.recommendationDecision === 'RECOMMEND' ? 'default' : 'outline'
                }
              >
                {evaluation.recommendationDecision}
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

          {evaluation?.summary ? (
            <p className="text-foreground line-clamp-3 text-sm leading-relaxed">
              {evaluation.summary}
            </p>
          ) : null}

          {evaluation?.recommendationReason ? (
            <p className="text-muted-foreground border-l-2 pl-3 text-sm italic line-clamp-2">
              {evaluation.recommendationReason}
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
                PDF ↗
              </a>
            ) : null}
            {arxivUrl ? (
              <a
                href={arxivUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                arXiv ↗
              </a>
            ) : null}
            {openReviewUrl ? (
              <a
                href={openReviewUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                OpenReview ↗
              </a>
            ) : null}
            {huggingFaceUrl ? (
              <a
                href={huggingFaceUrl}
                className="hover:text-foreground"
                target="_blank"
                rel="noreferrer"
              >
                HuggingFace ↗
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
                Code ↗
              </a>
            ))}
          </div>
        </div>
        <PaperFigureThumb paper={paper} />
      </div>
    </article>
  );
}

function PaperFigureThumb({ paper }: { paper: PaperCardPaper }) {
  if (!paper.figure) {
    return (
      <div
        aria-hidden
        className="bg-muted/40 hidden h-28 w-40 shrink-0 rounded-md border border-dashed sm:block"
      />
    );
  }
  const labelPart = paper.figure.figureLabel ?? 'Highlight figure';
  const captionPart = paper.figure.caption ? `: ${paper.figure.caption}` : '';
  return (
    // eslint-disable-next-line @next/next/no-img-element -- served from our own
    // /api/papers/[id]/figure route; next/image optimization is not needed for
    // a small, cache-controlled thumbnail.
    <img
      src={`/api/papers/${paper.id}/figure`}
      alt={`${labelPart}${captionPart}`}
      loading="lazy"
      decoding="async"
      className="bg-muted hidden h-28 w-40 shrink-0 rounded-md border object-cover sm:block"
    />
  );
}

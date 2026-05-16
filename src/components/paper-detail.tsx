import type { PaperEvaluation } from '@prisma/client';

import { Badge } from '@/components/ui/badge';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { Separator } from '@/components/ui/separator';
import type { PaperWithDetail } from '@/server/repos/papers';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { formatAuthors, formatDate, stringsFromJson } from '@/lib/format';

interface PaperDetailProps {
  paper: PaperWithDetail;
}

const SOURCE_LABEL: Record<PaperWithDetail['primarySource'], string> = {
  ARXIV: 'arXiv',
  OPENREVIEW: 'OpenReview',
  HUGGINGFACE: 'Hugging Face',
};

const STAGE_LABEL: Record<PaperEvaluation['evaluationStage'], string> = {
  ABSTRACT_SCREENING: 'Abstract screening',
  FULL_PDF: 'Full PDF analysis',
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

export function PaperDetail({ paper }: PaperDetailProps) {
  const evaluation = selectBestEvaluation(paper.evaluations);
  const strengths = evaluation ? stringsFromJson(evaluation.strengths) : [];
  const weaknesses = evaluation ? stringsFromJson(evaluation.weaknesses) : [];

  return (
    <article className="space-y-8">
      <header className="space-y-3">
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
        </div>
        <h1 className="text-3xl leading-tight font-semibold tracking-tight">{paper.title}</h1>
        <p className="text-muted-foreground text-sm">
          {formatAuthors(paper.authors)}
          <span className="mx-2">·</span>
          Published {formatDate(paper.publishedDate)}
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
                ? `${paper.figure.figureLabel}${paper.figure.caption ? `: ${paper.figure.caption}` : ''}`
                : 'Highlight figure'
            }
            loading="eager"
            decoding="async"
            className="bg-muted mx-auto max-h-[28rem] w-auto max-w-full rounded-md border object-contain"
          />
          {paper.figure.caption ? (
            <figcaption className="text-muted-foreground text-center text-xs leading-relaxed">
              {paper.figure.figureLabel ? (
                <span className="font-medium">{paper.figure.figureLabel}</span>
              ) : null}
              {paper.figure.figureLabel && paper.figure.caption ? ' · ' : ''}
              {paper.figure.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {evaluation ? (
        <section className="bg-card rounded-lg border p-6">
          <ScoreBreakdown evaluation={evaluation} />
        </section>
      ) : null}

      {evaluation?.summary ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Summary</h2>
          <p className="leading-relaxed">{evaluation.summary}</p>
        </section>
      ) : null}

      {evaluation?.recommendationReason ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">
            Why recommended
          </h2>
          <p className="text-muted-foreground border-l-2 pl-3 italic leading-relaxed">
            {evaluation.recommendationReason}
          </p>
        </section>
      ) : null}

      {evaluation?.rankingExplanation ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Ranking note</h2>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {evaluation.rankingExplanation}
          </p>
        </section>
      ) : null}

      {paper.abstract ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Abstract</h2>
          <p className="leading-relaxed">{paper.abstract}</p>
        </section>
      ) : null}

      {evaluation?.keyContribution ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Key contribution</h2>
          <p className="leading-relaxed">{evaluation.keyContribution}</p>
        </section>
      ) : null}

      {evaluation?.methodologySummary ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Methodology</h2>
          <p className="leading-relaxed">{evaluation.methodologySummary}</p>
        </section>
      ) : null}

      {strengths.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Strengths</h2>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            {strengths.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {weaknesses.length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">Weaknesses</h2>
          <ul className="list-disc space-y-1 pl-5 leading-relaxed">
            {weaknesses.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <Separator />

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide">Links</h2>
        <ul className="space-y-1.5 text-sm">
          {paper.pdfUrl ? (
            <li>
              <a
                href={paper.pdfUrl}
                className="hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                PDF ↗
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
                {SOURCE_LABEL[s.source]}: {s.sourceUrl} ↗
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
                Code: {c.codeUrl} ↗
              </a>
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}

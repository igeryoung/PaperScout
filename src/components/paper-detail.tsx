import type { PaperEvaluation, UserPaperStatus } from '@prisma/client';
import { Code2, ExternalLink, FileText, Sparkles } from 'lucide-react';

import { ScoreBreakdown } from '@/components/score-breakdown';
import { PaperDetailActions } from '@/components/paper-detail-actions';
import { PaperDigest, type DigestShape } from '@/components/paper-digest';
import type { PaperWithDetail } from '@/server/repos/papers';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { formatAuthors, formatDate } from '@/lib/format';
import { pickLocalized, pickLocalizedList, type Locale } from '@/lib/locale';
import type { Messages } from '@/i18n';

interface PaperDetailProps {
  paper: PaperWithDetail;
  locale: Locale;
  messages: Messages;
  userPaper: { liked: boolean; status: UserPaperStatus; note: string } | null;
  signedIn: boolean;
}

const SECTION_LABEL = 'text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]';
const CARD =
  'rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]';

function sourceIcon(source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE') {
  if (source === 'ARXIV') return <FileText aria-hidden className="h-4 w-4" />;
  return <ExternalLink aria-hidden className="h-4 w-4" />;
}

function stageLabel(evaluation: PaperEvaluation, messages: Messages) {
  const stage =
    evaluation.evaluationStage === 'FULL_PDF'
      ? messages.paperDetail.stageFullPdf
      : messages.paperDetail.stageAbstract;
  if (evaluation.evaluationStage === 'FULL_PDF') {
    const status = evaluation.pdfAnalysisStatus ?? 'UNAVAILABLE';
    return `${stage} · ${status}`;
  }
  return stage;
}

function decisionTone(decision: 'RECOMMEND' | 'STORE_ONLY' | 'LOW_QUALITY') {
  if (decision === 'RECOMMEND') return 'border-[#cfe9df] bg-[#e9f7f2] text-[#087d6c]';
  if (decision === 'LOW_QUALITY') return 'border-[#f4cdd2] bg-[#fff5f5] text-[#b42318]';
  return 'border-[#e2e7ef] bg-[#f2f4f8] text-[#475467]';
}

export function PaperDetail({ paper, locale, messages, userPaper, signedIn }: PaperDetailProps) {
  const evaluation = selectBestEvaluation(paper.evaluations);
  const summary = pickLocalized(evaluation?.summary, locale);
  const reason = pickLocalized(evaluation?.recommendationReason, locale);
  const rankingExplanation = pickLocalized(evaluation?.rankingExplanation, locale);
  const keyContribution = pickLocalized(evaluation?.keyContribution, locale);
  const methodologySummary = pickLocalized(evaluation?.methodologySummary, locale);
  const strengths = evaluation ? pickLocalizedList(evaluation.strengths, locale) : [];
  const weaknesses = evaluation ? pickLocalizedList(evaluation.weaknesses, locale) : [];
  const figureCaption = pickLocalized(paper.figure?.caption, locale);
  const digest = (evaluation?.digest ?? null) as DigestShape | null;
  const sourceLabels = messages.common.sources;
  const t = messages.paperDetail;

  const links: Array<{ key: string; href: string; label: string; icon: React.ReactNode }> = [];
  if (paper.pdfUrl) {
    links.push({
      key: 'pdf',
      href: paper.pdfUrl,
      label: messages.common.pdf,
      icon: <FileText aria-hidden className="h-4 w-4" />,
    });
  }
  paper.sources.forEach((s) => {
    links.push({
      key: s.id,
      href: s.sourceUrl,
      label: sourceLabels[s.source],
      icon: sourceIcon(s.source),
    });
  });
  paper.codeLinks.forEach((c) => {
    links.push({
      key: c.id,
      href: c.codeUrl,
      label: messages.common.code,
      icon: <Code2 aria-hidden className="h-4 w-4" />,
    });
  });

  return (
    <article className="space-y-6">
      <header className="rounded-2xl border border-[#e5e9f3] bg-gradient-to-b from-white to-[#fbfbff] p-6 shadow-[0_12px_32px_rgba(24,34,64,0.055)] sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-[#e2e7ef] bg-[#f7f9ff] px-2.5 py-0.5 text-xs font-bold text-[#475467]">
            {sourceLabels[paper.primarySource]}
          </span>
          {evaluation ? (
            <span className="inline-flex items-center rounded-full border border-[#e2e7ef] bg-white px-2.5 py-0.5 text-xs font-medium text-[#667085]">
              {stageLabel(evaluation, messages)}
            </span>
          ) : null}
          {evaluation?.recommendationDecision ? (
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${decisionTone(evaluation.recommendationDecision)}`}
            >
              {messages.common.decisions[evaluation.recommendationDecision]}
            </span>
          ) : null}
        </div>
        <h1 className="mt-4 text-2xl font-extrabold leading-tight tracking-tight text-[#111827] sm:text-3xl">
          {paper.title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#475467]">
          {formatAuthors(paper.authors)}
        </p>
        <p className="mt-1 text-sm text-[#667085]">
          {t.publishedPrefix} {formatDate(paper.publishedDate)}
          {paper.venue ? <span className="mx-2">·</span> : null}
          {paper.venue ? <span className="font-medium text-[#475467]">{paper.venue}</span> : null}
        </p>
        {paper.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {paper.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-[#eeedff] px-2 py-1 text-[11.5px] font-extrabold text-[#5848f5]"
              >
                {tag.tag}
              </span>
            ))}
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {paper.figure ? (
            <figure className={`${CARD} space-y-3`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- served from our own /api/papers/[id]/figure route. */}
              <img
                src={`/api/papers/${paper.id}/figure`}
                alt={
                  paper.figure.figureLabel
                    ? `${paper.figure.figureLabel}${figureCaption ? `: ${figureCaption}` : ''}`
                    : t.figureFallback
                }
                loading="eager"
                decoding="async"
                className="mx-auto max-h-[28rem] w-auto max-w-full rounded-xl border border-[#e5e9f3] bg-[#f7f9ff] object-contain"
              />
              {figureCaption ? (
                <figcaption className="text-center text-xs leading-relaxed text-[#667085]">
                  {paper.figure.figureLabel ? (
                    <span className="font-bold text-[#475467]">{paper.figure.figureLabel}</span>
                  ) : null}
                  {paper.figure.figureLabel && figureCaption ? ' · ' : ''}
                  {figureCaption}
                </figcaption>
              ) : null}
            </figure>
          ) : null}

          {digest ? (
            <PaperDigest digest={digest} locale={locale} messages={messages} />
          ) : null}

          {summary ? (
            <section className={CARD}>
              <h2 className={SECTION_LABEL}>{t.summary}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[#1f2937]">{summary}</p>
            </section>
          ) : null}

          {reason ? (
            <section className="rounded-2xl border border-[#e0deff] bg-gradient-to-br from-[#fbfaff] to-[#f4f1ff] p-5 shadow-[0_12px_32px_rgba(57,46,229,0.06)]">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#eeedff] text-[#5848f5]">
                  <Sparkles aria-hidden className="h-4 w-4" />
                </span>
                <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]">
                  {t.whyRecommended}
                </h2>
              </div>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[#3a3573]">{reason}</p>
            </section>
          ) : null}

          {rankingExplanation ? (
            <section className={CARD}>
              <h2 className={SECTION_LABEL}>{t.rankingNote}</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#475467]">{rankingExplanation}</p>
            </section>
          ) : null}

          {paper.abstract ? (
            <section className={CARD}>
              <details className="group" open>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <h2 className={SECTION_LABEL}>{t.abstract}</h2>
                  <span className="text-[11px] font-bold text-[#5848f5] group-open:hidden">
                    {t.abstractShowMore}
                  </span>
                  <span className="hidden text-[11px] font-bold text-[#5848f5] group-open:inline">
                    {t.abstractShowLess}
                  </span>
                </summary>
                <p className="mt-3 text-[14.5px] leading-relaxed text-[#1f2937]">{paper.abstract}</p>
              </details>
            </section>
          ) : null}

          {keyContribution ? (
            <section className={CARD}>
              <h2 className={SECTION_LABEL}>{t.keyContribution}</h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[#1f2937]">{keyContribution}</p>
            </section>
          ) : null}

          {methodologySummary ? (
            <section className={CARD}>
              <h2 className={SECTION_LABEL}>{t.methodology}</h2>
              <p className="mt-3 text-[14.5px] leading-relaxed text-[#1f2937]">
                {methodologySummary}
              </p>
            </section>
          ) : null}

          {strengths.length > 0 || weaknesses.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {strengths.length > 0 ? (
                <section className="rounded-2xl border border-[#cfe9df] bg-[#f3faf7] p-5 shadow-[0_12px_32px_rgba(8,125,108,0.04)]">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#087d6c]">
                    {t.strengths}
                  </h2>
                  <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-[#1f2937]">
                    {strengths.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span
                          aria-hidden
                          className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#087d6c]"
                        />
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {weaknesses.length > 0 ? (
                <section className="rounded-2xl border border-[#f4cdd2] bg-[#fff7f7] p-5 shadow-[0_12px_32px_rgba(180,35,24,0.04)]">
                  <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#b42318]">
                    {t.weaknesses}
                  </h2>
                  <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-[#1f2937]">
                    {weaknesses.map((w, i) => (
                      <li key={i} className="flex gap-2">
                        <span
                          aria-hidden
                          className="mt-2 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#b42318]"
                        />
                        <span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          ) : null}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          {evaluation ? (
            <section className={CARD}>
              <ScoreBreakdown evaluation={evaluation} messages={messages} />
            </section>
          ) : null}

          <PaperDetailActions
            paperId={paper.id}
            signedIn={signedIn}
            initialLiked={userPaper?.liked ?? false}
            initialStatus={userPaper ? userPaper.status : null}
            initialNote={userPaper?.note ?? ''}
            labels={{
              actionsHeader: t.actionsHeader,
              save: t.save,
              saved: t.saved,
              statusHeader: t.statusHeader,
              notesHeader: t.notesHeader,
              notePlaceholder: messages.library.notePlaceholder,
              noteSavedJustNow: t.noteSavedJustNow,
              noteSaving: t.noteSaving,
              noteSaveFailed: t.noteSaveFailed,
              signedOutTitle: t.signedOutTitle,
              signedOutBody: t.signedOutBody,
              signedOutCta: t.signedOutCta,
              statuses: messages.library.statuses,
            }}
          />

          {links.length > 0 ? (
            <section className={CARD}>
              <h2 className={SECTION_LABEL}>{t.links}</h2>
              <ul className="mt-3 space-y-2">
                {links.map((link) => (
                  <li key={link.key}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[36px] w-full items-center gap-2 rounded-[10px] border border-[#d9e1ee] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#344054] transition-colors hover:border-[#c9c8ff] hover:bg-[#fbfaff] hover:text-[#5848f5]"
                    >
                      {link.icon}
                      <span className="truncate">{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  );
}

import type { UserPaperStatus } from '@prisma/client';
import Link from 'next/link';
import {
  CheckCircle2,
  Code2,
  ExternalLink,
  FileText,
  XCircle,
} from 'lucide-react';

import { PaperComments, type PaperCommentItem } from '@/components/paper-comments';
import { PaperDetailActions } from '@/components/paper-detail-actions';
import { PaperDigest, type DigestShape } from '@/components/paper-digest';
import { StickySidebar } from '@/components/sticky-sidebar';
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
  comments: PaperCommentItem[];
  currentUserId: string | null;
}

const SECTION_LABEL = 'text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]';
const CARD =
  'rounded-[10px] border border-[#e5e9f3] bg-white shadow-[0_18px_50px_rgba(31,42,68,0.08)]';

function sourceIcon(source: 'ARXIV' | 'OPENREVIEW' | 'HUGGINGFACE' | 'OPENACCESS') {
  if (source === 'ARXIV') return <FileText aria-hidden className="h-4 w-4" />;
  return <ExternalLink aria-hidden className="h-4 w-4" />;
}

export function PaperDetail({
  paper,
  locale,
  messages,
  userPaper,
  signedIn,
  comments,
  currentUserId,
}: PaperDetailProps) {
  const evaluation = selectBestEvaluation(paper.evaluations);
  const summary = pickLocalized(evaluation?.summary, locale);
  const strengths = evaluation ? pickLocalizedList(evaluation.strengths, locale) : [];
  const weaknesses = evaluation ? pickLocalizedList(evaluation.weaknesses, locale) : [];
  const figureCaption = pickLocalized(paper.figure?.caption, locale);
  const digest = (evaluation?.digest ?? null) as DigestShape | null;
  const sourceLabels = messages.common.sources;
  const t = messages.paperDetail;

  const arxivSource = paper.sources.find((s) => s.source === 'ARXIV');
  const openReviewSource = paper.sources.find((s) => s.source === 'OPENREVIEW');
  const huggingFaceSource = paper.sources.find((s) => s.source === 'HUGGINGFACE');

  const sidebarLinks: Array<{ key: string; href: string; label: string; icon: React.ReactNode }> = [];
  if (paper.pdfUrl) {
    sidebarLinks.push({
      key: 'pdf',
      href: paper.pdfUrl,
      label: messages.common.pdf,
      icon: <FileText aria-hidden className="h-4 w-4" />,
    });
  }
  paper.sources.forEach((s) => {
    sidebarLinks.push({
      key: s.id,
      href: s.sourceUrl,
      label: sourceLabels[s.source],
      icon: sourceIcon(s.source),
    });
  });
  paper.codeLinks.forEach((c) => {
    sidebarLinks.push({
      key: c.id,
      href: c.codeUrl,
      label: messages.common.code,
      icon: <Code2 aria-hidden className="h-4 w-4" />,
    });
  });

  const quickLinks: Array<{ key: string; href: string; label: string }> = [];
  if (paper.pdfUrl) quickLinks.push({ key: 'pdf', href: paper.pdfUrl, label: messages.common.pdf });
  if (arxivSource)
    quickLinks.push({ key: 'arxiv', href: arxivSource.sourceUrl, label: `${sourceLabels.ARXIV} ↗` });
  if (openReviewSource)
    quickLinks.push({
      key: 'openreview',
      href: openReviewSource.sourceUrl,
      label: `${sourceLabels.OPENREVIEW} ↗`,
    });
  if (huggingFaceSource)
    quickLinks.push({
      key: 'huggingface',
      href: huggingFaceSource.sourceUrl,
      label: `${sourceLabels.HUGGINGFACE} ↗`,
    });
  paper.codeLinks.forEach((c) =>
    quickLinks.push({ key: c.id, href: c.codeUrl, label: messages.common.code }),
  );

  return (
    <article>
      <header
        className={`${CARD} overflow-hidden`}
        style={{
          background:
            'radial-gradient(circle at 88% 30%, rgba(124,101,255,0.14), transparent 26%), #fff',
        }}
      >
        <div className="p-5 sm:p-6">
          <div className="min-w-0">
            <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-[#111827] sm:text-[30px] md:text-[32px]">
              {paper.title}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#475467]">
              {formatAuthors(paper.authors)}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#667085]">
              <span>
                {t.publishedPrefix} {formatDate(paper.publishedDate)}
              </span>
              {paper.venue ? (
                <>
                  <span aria-hidden>|</span>
                  <span className="font-semibold text-[#475467]">{paper.venue}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>

        {paper.tags.length > 0 ? (
          <div className="border-t border-[#edf1f7] px-5 py-3 sm:px-6">
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
          </div>
        ) : null}

        {quickLinks.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[#edf1f7] px-5 py-3 text-[13px] font-bold text-[#392ee5] sm:px-6">
            {quickLinks.map((link) => (
              <a key={link.key} href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        ) : null}
      </header>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="space-y-6">
          {paper.figure ? (
            <figure
              id="figure"
              className={`${CARD} scroll-mt-[120px] space-y-3 p-5`}
            >
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
                className="mx-auto max-h-[28rem] w-auto max-w-full rounded-lg border border-[#e5e9f3] bg-[#fbfcff] object-contain"
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
            <section id="summary" className={`${CARD} scroll-mt-[120px] p-5`}>
              <h2 className={SECTION_LABEL}>{t.summary}</h2>
              <p className="mt-3 text-[15px] leading-relaxed text-[#1f2937]">{summary}</p>
            </section>
          ) : null}

          {strengths.length > 0 || weaknesses.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {strengths.length > 0 ? (
                <section
                  id="strengths"
                  className="scroll-mt-[120px] rounded-[10px] border border-[#cfe9df] bg-[#f3faf7] p-5 shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
                >
                  <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#087d6c]">
                    <CheckCircle2 aria-hidden className="h-4 w-4" />
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
                <section
                  id="weaknesses"
                  className="scroll-mt-[120px] rounded-[10px] border border-[#f4cdd2] bg-[#fff7f7] p-5 shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
                >
                  <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#b42318]">
                    <XCircle aria-hidden className="h-4 w-4" />
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

        <StickySidebar className="space-y-4 lg:self-start">
          <section className={`${CARD} p-5`}>
            <PaperComments
              paperId={paper.id}
              signedIn={signedIn}
              currentUserId={currentUserId}
              initialComments={comments}
              labels={{
                commentsHeader: t.commentsHeader,
                commentsEmpty: t.commentsEmpty,
                commentPlaceholder: t.commentPlaceholder,
                commentPost: t.commentPost,
                commentPosting: t.commentPosting,
                commentFailed: t.commentFailed,
                commentDelete: t.commentDelete,
                commentAnonymous: t.commentAnonymous,
                commentSignInCta: t.commentSignInCta,
                commentSignInBody: t.commentSignInBody,
              }}
            />
          </section>

          {sidebarLinks.length > 0 ? (
            <section className={`${CARD} p-5`}>
              <h2 className={SECTION_LABEL}>{t.links}</h2>
              <ul className="mt-3 space-y-2">
                {sidebarLinks.map((link) => (
                  <li key={link.key}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-[33px] w-full items-center gap-2 rounded-[7px] border border-[#d9e1ee] bg-white px-3 text-[13px] font-semibold text-[#344054] transition-colors hover:border-[#c9c8ff] hover:bg-[#fbfaff] hover:text-[#392ee5]"
                    >
                      {link.icon}
                      <span className="truncate">{link.label}</span>
                    </a>
                  </li>
                ))}
              </ul>
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
        </StickySidebar>
      </div>
    </article>
  );
}

import 'server-only';

import Link from 'next/link';
import Form from 'next/form';
import { Suspense } from 'react';
import {
  ArrowRight,
  BarChart3,
  FileText,
  LoaderCircle,
  Shield,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import { runsRepo } from '@/server/repos/runs';
import { runResultsRepo, type RunResultWithDetail } from '@/server/repos/runResults';
import { papersRepo, type PaperCardPayload } from '@/server/repos/papers';
import {
  trendsRepo,
  type RunSummary,
  type SourceCount,
  type TagCount,
} from '@/server/repos/trends';
import { formatDate, formatDateTime } from '@/lib/format';
import { getLocale, type Locale } from '@/lib/locale';
import { formatSourceLabel } from '@/lib/source-label';
import { getMessages, type Messages } from '@/i18n';
import { getCurrentSession } from '@/server/auth/current-user';
import { libraryRepo } from '@/server/repos/library';
import { PaperFeedCard } from '@/components/paper-feed-card';

export const dynamic = 'force-dynamic';

const TOPIC_FALLBACKS = [
  'Computer Vision',
  'Multimodal',
  'RAG',
  'Robotics',
  'Diffusion Models',
  'AI Safety',
];

// Number of papers each feed tab surfaces.
const HOME_FEED_COUNT = 5;

// "High score" tab samples from papers whose displayed score is >= 7.5; the
// stored totalScore is on a 0-100 scale (the card shows totalScore / 10).
const HIGH_SCORE_MIN = 75;

// The four home-feed tabs: 為你推薦 / 熱門趨勢 / 最新發佈 / 高分推薦.
type FeedTab = 'recommended' | 'trending' | 'latest' | 'top';

interface HomePageProps {
  searchParams: Promise<{
    locale?: string;
    tab?: string;
  }>;
}

interface HomeDataPromises {
  summary: Promise<RunSummary>;
  sourceDistribution: Promise<SourceCount[]>;
  tagDistribution: Promise<TagCount[]>;
  recommended: Promise<RunResultWithDetail[]>;
  session: ReturnType<typeof getCurrentSession>;
}

function parseTab(value: string | undefined): FeedTab {
  return value === 'trending' || value === 'latest' || value === 'top' ? value : 'recommended';
}

function paperDate(paper: PaperCardPayload): Date | null {
  const raw = paper.publishedDate ?? paper.createdAt;
  return raw ? new Date(raw) : null;
}

/** Fisher-Yates shuffle, then take the first `count` items. */
function sampleRandom<T>(items: T[], count: number): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
}

/**
 * Resolve the papers shown for the active feed tab:
 * - recommended (為你推薦): a random handful of the latest run, reshuffled each request.
 * - latest (最新發佈): all papers from the latest run, newest published date first.
 * - top (高分推薦): a random handful of all papers scoring >= 7.5.
 * - trending (熱門趨勢): not yet available (needs reader views) — handled by the
 *   coming-soon panel, never reaches here.
 */
async function papersForTab(runId: string, tab: FeedTab) {
  if (tab === 'top') {
    const pool = await papersRepo.listHighScoreCards(HIGH_SCORE_MIN);
    return sampleRandom(pool, HOME_FEED_COUNT);
  }
  const runCards = (
    await runResultsRepo.findByRunWithDetail(runId, { recommendedOnly: false })
  ).map((result) => result.paper);
  if (tab === 'latest') {
    // 最新發佈: show every paper from the latest run, newest published date first.
    return [...runCards].sort(
      (a, b) => (paperDate(b)?.getTime() ?? 0) - (paperDate(a)?.getTime() ?? 0),
    );
  }
  // recommended (default)
  return sampleRandom(runCards, HOME_FEED_COUNT);
}

function buildFeedHref(
  searchParams: Awaited<HomePageProps['searchParams']>,
  tab: FeedTab,
): string {
  const params = new URLSearchParams();
  if (searchParams.locale) params.set('locale', searchParams.locale);
  if (tab !== 'recommended') params.set('tab', tab);
  const qs = params.toString();
  return qs ? `/?${qs}` : '/';
}

function EmptyState({ messages }: { messages: Messages }) {
  const t = messages.home;
  return (
    <main className="mx-auto max-w-[1760px] px-4 py-6 sm:px-6 lg:px-12">
      <section className="grid min-h-[420px] place-items-center rounded-[10px] border border-dashed border-[#d9deea] bg-white px-6 py-12 text-center shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
        <div className="max-w-2xl">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#eef0ff] text-[#5b4df1]">
            <Sparkles aria-hidden className="h-7 w-7" />
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-[#111827]">{t.emptyTitle}</h1>
          <p className="mt-3 text-sm leading-6 text-[#667085]">{t.emptyBody}</p>
          <pre className="mx-auto mt-6 max-w-xl overflow-x-auto rounded-lg bg-[#f2f4f8] p-4 text-left font-mono text-xs text-[#344054]">
            {t.emptyCommands}
          </pre>
          <p className="mt-6 text-sm text-[#667085]">
            {t.emptyLibraryHint}{' '}
            <Link href="/library" className="font-semibold text-[#392ee5] underline">
              {t.emptyLibraryLink}
            </Link>{' '}
            {t.emptyLibraryAfter}
          </p>
        </div>
      </section>
    </main>
  );
}

function HomePagePlaceholder() {
  return (
    <main className="mx-auto max-w-[1760px] px-4 py-4 sm:px-6 lg:px-12">
      <section className="grid min-h-[216px] items-center gap-10 rounded-[10px] bg-[linear-gradient(100deg,#edf7ff_0%,#f8f0ff_51%,#eaf4ff_100%)] px-5 py-6 shadow-[0_18px_50px_rgba(31,42,68,0.08)] md:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:px-24 xl:px-44">
        <div className="max-w-[700px]">
          <div className="mb-4 h-8 w-72 max-w-full animate-pulse rounded bg-white/80" />
          <div className="mb-5 h-4 w-full max-w-[560px] animate-pulse rounded bg-white/70" />
          <div className="h-[54px] rounded-[9px] border border-[#d9deea] bg-white shadow-[0_12px_26px_rgba(45,52,88,0.14)]" />
          <div className="mt-4 flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="h-[27px] w-24 animate-pulse rounded-full bg-[#dfe4ff]" />
            ))}
          </div>
        </div>
        <div className="hidden min-h-[176px] animate-pulse rounded-[10px] bg-white/50 md:block" />
      </section>

      <div className="mt-5 grid grid-cols-1 gap-9 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="rounded-[10px] border border-[#e5e9f3] bg-white shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
          <div className="border-b border-[#e5e9f3] px-5 pt-2.5">
            <div className="mb-3 h-5 w-60 animate-pulse rounded bg-[#edf1f7]" />
          </div>
          <div className="grid gap-3.5 px-5 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#dfe5ee] bg-white p-4 xl:grid-cols-[280px_minmax(0,1fr)_230px]"
              >
                <div className="h-44 animate-pulse rounded-lg bg-[#edf1f7]" />
                <div className="space-y-3">
                  <div className="h-5 w-4/5 animate-pulse rounded bg-[#edf1f7]" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-[#edf1f7]" />
                  <div className="h-16 animate-pulse rounded bg-[#edf1f7]" />
                </div>
                <div className="space-y-3">
                  <div className="h-16 w-16 animate-pulse rounded-full bg-[#edf1f7]" />
                  <div className="h-[68px] animate-pulse rounded-lg bg-[#eaf8f4]" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="grid content-start gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <section
              key={i}
              className="min-h-[132px] rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
            >
              <div className="mb-4 h-5 w-36 animate-pulse rounded bg-[#edf1f7]" />
              <div className="grid gap-2">
                <div className="h-4 animate-pulse rounded bg-[#edf1f7]" />
                <div className="h-4 w-2/3 animate-pulse rounded bg-[#edf1f7]" />
              </div>
            </section>
          ))}
        </aside>
      </div>
    </main>
  );
}

function LoadingIcon({ label }: { label: string }) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-grid h-8 w-8 place-items-center rounded-full bg-[#eef0ff] text-[#5b4df1]"
    >
      <LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function LoadingPanel({ label, minHeight = 132 }: { label: string; minHeight?: number }) {
  return (
    <section
      className="grid place-items-center rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
      style={{ minHeight }}
    >
      <LoadingIcon label={label} />
    </section>
  );
}

function HeroLoading({ messages }: { messages: Messages }) {
  return (
    <section className="grid min-h-[216px] items-center gap-10 rounded-[10px] bg-[linear-gradient(100deg,#edf7ff_0%,#f8f0ff_51%,#eaf4ff_100%)] px-5 py-6 shadow-[0_18px_50px_rgba(31,42,68,0.08)] md:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:px-24 xl:px-44">
      <div className="max-w-[700px]">
        <div className="mb-4 flex items-center gap-3">
          <LoadingIcon label={messages.home.loadingHero} />
          <div className="h-8 w-72 max-w-full animate-pulse rounded bg-white/80" />
        </div>
        <div className="mb-5 h-4 w-full max-w-[560px] animate-pulse rounded bg-white/70" />
        <div className="h-[54px] rounded-[9px] border border-[#d9deea] bg-white shadow-[0_12px_26px_rgba(45,52,88,0.14)]" />
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="h-[27px] w-24 animate-pulse rounded-full bg-[#dfe4ff]" />
          ))}
        </div>
      </div>
      <div className="hidden min-h-[176px] animate-pulse rounded-[10px] bg-white/50 md:block" />
    </section>
  );
}

function FeedResultsLoading({ messages }: { messages: Messages }) {
  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-dashed border-[#d9deea] bg-[#fbfcff] p-4">
        <LoadingIcon label={messages.home.loadingFeed} />
        <span className="h-4 w-48 max-w-full animate-pulse rounded bg-[#edf1f7]" />
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#dfe5ee] bg-white p-4 xl:grid-cols-[280px_minmax(0,1fr)_230px]"
        >
          <div className="h-44 animate-pulse rounded-lg bg-[#edf1f7]" />
          <div className="space-y-3">
            <div className="h-5 w-4/5 animate-pulse rounded bg-[#edf1f7]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[#edf1f7]" />
            <div className="h-16 animate-pulse rounded bg-[#edf1f7]" />
          </div>
          <div className="space-y-3">
            <div className="h-16 w-16 animate-pulse rounded-full bg-[#edf1f7]" />
            <div className="h-[68px] animate-pulse rounded-lg bg-[#eaf8f4]" />
          </div>
        </div>
      ))}
    </>
  );
}

function TopicChips({ tags, label }: { tags: TagCount[]; label: string }) {
  const topics = tags.length > 0 ? tags.map((t) => t.tag) : TOPIC_FALLBACKS;
  return (
    <div className="mt-4 flex max-h-[62px] flex-wrap items-center gap-2 overflow-hidden text-sm text-[#5f6b7a]">
      <span>{label}</span>
      {topics.slice(0, 7).map((topic) => (
        <Link
          key={topic}
          href={`/papers?tag=${encodeURIComponent(topic)}`}
          className="inline-flex min-h-[27px] items-center rounded-full bg-[#dfe4ff] px-3.5 text-[13px] font-bold whitespace-nowrap text-[#2734b7]"
        >
          {topic}
        </Link>
      ))}
    </div>
  );
}

function Hero({ summary, messages }: { summary: RunSummary; messages: Messages }) {
  const t = messages.home;
  return (
    <section
      className="relative min-h-[216px] overflow-hidden rounded-[10px] bg-[#e9e6fb] bg-[url(/main-page-hero.png)] bg-cover bg-center bg-no-repeat px-5 py-7 shadow-[0_18px_50px_rgba(31,42,68,0.08)] sm:px-10 sm:py-9 lg:px-16"
      aria-labelledby="hero-title"
    >
      <div className="relative max-w-[560px] sm:ml-6 lg:ml-12">
        <h1
          id="hero-title"
          className="mb-3.5 text-[29px] leading-[1.12] font-extrabold tracking-normal text-[#111827] md:text-[34px]"
        >
          {t.heroTitle}
        </h1>
        <p className="mb-5 text-sm text-[#273142]">{t.heroSubtitle}</p>
        <Form
          action="/papers"
          className="grid min-h-[54px] grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-[9px] border border-[#d9deea] bg-white pr-2 pl-5 shadow-[0_12px_26px_rgba(45,52,88,0.14)] max-sm:grid-cols-[auto_1fr] max-sm:p-3"
        >
          <Sparkles aria-hidden className="h-5 w-5 text-[#5b4df1]" />
          <input
            type="text"
            name="q"
            aria-label={t.heroSearchAria}
            placeholder={t.heroSearchPlaceholder}
            className="min-w-0 border-0 bg-transparent text-[15px] text-[#475467] outline-none placeholder:text-[#98a2b3]"
          />
          <button
            type="submit"
            aria-label={t.heroSubmitAria}
            title={t.heroSubmitTitle}
            className="grid h-[38px] w-[38px] place-items-center rounded-[7px] bg-gradient-to-br from-[#7868ff] to-[#4437e7] text-white shadow-[0_10px_24px_rgba(91,77,241,0.28)] transition hover:brightness-110 max-sm:col-span-2 max-sm:w-full"
          >
            <ArrowRight aria-hidden className="h-5 w-5" />
          </button>
        </Form>
        <TopicChips tags={summary.topTags} label={t.heroTopicsLabel} />
      </div>
    </section>
  );
}

function FeedTabs({
  activeTab,
  searchParams,
  messages,
  latestCount,
  latestUpdatedAt,
}: {
  activeTab: FeedTab;
  searchParams: Awaited<HomePageProps['searchParams']>;
  messages: Messages;
  latestCount: number;
  latestUpdatedAt: string;
}) {
  const t = messages.home;
  // 熱門趨勢 needs reader-view data we don't collect yet — disabled for now.
  const tabs = [
    { key: 'recommended' as const, label: t.feedTabRecommended, icon: Star, comingSoon: false },
    { key: 'trending' as const, label: t.feedTabTrending, icon: TrendingUp, comingSoon: true },
    { key: 'latest' as const, label: t.feedTabLatest, icon: Shield, comingSoon: false },
    { key: 'top' as const, label: t.feedTabTop, icon: BarChart3, comingSoon: false },
  ];
  return (
    <div
      className="flex min-w-0 gap-6 overflow-x-auto"
      role="tablist"
      aria-label={t.feedTablistAria}
    >
      {tabs.map(({ key, label, icon: Icon, comingSoon }) => {
        if (comingSoon) {
          return (
            <span
              key={key}
              role="tab"
              aria-disabled="true"
              title={t.feedComingSoon}
              className="inline-flex cursor-not-allowed items-center gap-2 border-b-[3px] border-transparent pb-3 text-sm whitespace-nowrap text-[#98a2b3]"
            >
              <Icon aria-hidden className="h-4 w-4" />
              {label}
              <span className="rounded-full bg-[#eef0ff] px-2 py-0.5 text-[10px] font-bold text-[#6570e8]">
                {t.feedComingSoon}
              </span>
            </span>
          );
        }
        const active = key === activeTab;
        const showLatestBadge = key === 'latest' && latestCount > 0;
        return (
          <Link
            key={key}
            href={buildFeedHref(searchParams, key)}
            role="tab"
            aria-selected={active}
            className={
              active
                ? 'inline-flex items-center gap-2 border-b-[3px] border-[#5b4df1] pb-3 text-sm font-extrabold whitespace-nowrap text-[#392ee5]'
                : 'inline-flex items-center gap-2 border-b-[3px] border-transparent pb-3 text-sm whitespace-nowrap text-[#344054] hover:text-[#392ee5]'
            }
          >
            <Icon aria-hidden className="h-4 w-4" />
            {label}
            {showLatestBadge && (
              <span
                title={t.feedLatestUpdatedTooltip(latestUpdatedAt)}
                aria-label={t.feedLatestCountAria(latestCount)}
                className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#eef0ff] px-1.5 py-0.5 text-[10px] font-bold text-[#6570e8] tabular-nums"
              >
                {latestCount}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

const FEED_TOOLBAR_CLASS =
  'flex items-center justify-between gap-4 border-b border-[#e5e9f3] px-5 pt-2.5 max-lg:flex-col max-lg:items-stretch';

function FeedToolbar({
  activeTab,
  searchParams,
  messages,
  latestCount,
  latestUpdatedAt,
}: {
  activeTab: FeedTab;
  searchParams: Awaited<HomePageProps['searchParams']>;
  messages: Messages;
  latestCount: number;
  latestUpdatedAt: string;
}) {
  return (
    <div className={FEED_TOOLBAR_CLASS}>
      <FeedTabs
        activeTab={activeTab}
        searchParams={searchParams}
        messages={messages}
        latestCount={latestCount}
        latestUpdatedAt={latestUpdatedAt}
      />
    </div>
  );
}


function HotTagsCard({ tags, messages }: { tags: TagCount[]; messages: Messages }) {
  const visible = tags.slice(0, 8);
  const t = messages.home;
  return (
    <section className="rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-normal text-[#111827]">
          {t.hotTagsTitle}
        </h3>
        <Link href="/library" className="text-xs font-bold text-[#5b4df1]">
          {t.hotTagsLink}
        </Link>
      </div>
      {visible.length === 0 ? (
        <p className="text-sm text-[#667085]">{t.hotTagsEmpty}</p>
      ) : (
        <div className="flex flex-wrap gap-2.5">
          {visible.map((tag) => (
            <Link
              key={tag.tag}
              href={`/papers?tag=${encodeURIComponent(tag.tag)}`}
              className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-[#eef0ff] px-3.5 text-[13px] font-bold text-[#2734b7]"
            >
              {tag.tag}
              <b className="text-xs text-[#6570e8]">{tag.count}</b>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function RecentRecommendationsCard({
  recommended,
  messages,
}: {
  recommended: RunResultWithDetail[];
  messages: Messages;
}) {
  const t = messages.home;
  const sourceLabels = messages.common.sources;
  return (
    <section className="rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-normal text-[#111827]">
          {t.recentTitle}
        </h3>
        <Link href="/library" className="text-xs font-bold text-[#5b4df1]">
          {t.recentLink}
        </Link>
      </div>
      <div className="grid gap-4">
        {recommended.slice(0, 3).map((r) => (
          <article key={r.id} className="grid grid-cols-[38px_1fr_auto] items-start gap-3">
            <span className="grid h-[42px] w-[34px] place-items-center rounded-md border border-[#d5dcf2] bg-[#f4f6ff] text-[#5b4df1]">
              <FileText aria-hidden className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h4 className="mb-1 line-clamp-2 text-[13px] leading-snug font-semibold text-[#111827]">
                <Link href={`/papers/${r.paper.id}`}>{r.paper.title}</Link>
              </h4>
              <p className="text-xs text-[#667085]">
                {formatSourceLabel({
                  source: r.paper.primarySource,
                  venue: r.paper.venue,
                  sourceLabels,
                })}{' '}
                | {formatDate(r.paper.publishedDate)}
              </p>
            </div>
            <span className="text-[#5b4df1]">♡</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourceMixCard({
  sources,
  messages,
}: {
  sources: SourceCount[];
  messages: Messages;
}) {
  const total = sources.reduce((acc, source) => acc + source.count, 0);
  const t = messages.home;
  const sourceLabels = messages.common.sources;
  return (
    <section className="rounded-[10px] border border-[#e5e9f3] bg-white px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[17px] font-semibold tracking-normal text-[#111827]">
          {t.sourceMixTitle}
        </h3>
      </div>
      {total === 0 ? (
        <p className="text-sm text-[#667085]">{t.sourceMixEmpty}</p>
      ) : (
        <ul className="grid gap-3">
          {sources.map((source) => (
            <li key={source.key} className="flex items-center justify-between text-sm">
              <span className="text-[#344054]">{source.label ?? sourceLabels[source.source]}</span>
              <span className="font-semibold text-[#392ee5] tabular-nums">
                {source.count} ({Math.round((source.count / total) * 100)}%)
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Hidden: personalized recommendation settings card.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PersonalCard({ messages }: { messages: Messages }) {
  const t = messages.home;
  return (
    <section className="grid grid-cols-[1fr_92px] items-center gap-4 rounded-[10px] border border-[#e5e9f3] bg-[radial-gradient(circle_at_88%_30%,rgba(124,101,255,0.14),transparent_26%),#fff] px-5 py-4 shadow-[0_18px_50px_rgba(31,42,68,0.08)] max-sm:grid-cols-1">
      <div>
        <h3 className="mb-2 text-[17px] font-semibold tracking-normal text-[#111827]">
          {t.personalTitle}
        </h3>
        <p className="mb-4 text-[13px] text-[#667085]">{t.personalBody}</p>
        <button
          type="button"
          disabled
          className="inline-flex min-h-[38px] cursor-not-allowed items-center rounded-[7px] bg-gradient-to-br from-[#7868ff] to-[#4437e7] px-5 text-sm font-extrabold text-white opacity-85"
        >
          {t.personalCta}
        </button>
      </div>
      <div
        aria-hidden
        className="relative h-[84px] w-[84px] rounded-[45%_45%_45%_38%] border-[3px] border-[#917eff] before:absolute before:top-[22px] before:left-[19px] before:h-[33px] before:w-[49px] before:rounded-t-full before:border-[3px] before:border-b-0 before:border-[#917eff] after:absolute after:top-[38px] after:left-[30px] after:h-2 after:w-2 after:rounded-full after:bg-[#917eff] after:shadow-[19px_-6px_0_#917eff,17px_15px_0_#917eff]"
      />
    </section>
  );
}


async function HeroSection({
  summary,
  messages,
}: {
  summary: Promise<RunSummary>;
  messages: Messages;
}) {
  return <Hero summary={await summary} messages={messages} />;
}

async function FeedResults({
  runId,
  tab,
  session,
  locale,
  messages,
}: {
  runId: string;
  tab: FeedTab;
  session: HomeDataPromises['session'];
  locale: Locale;
  messages: Messages;
}) {
  // 熱門趨勢 (trending) depends on reader-view data we don't collect yet.
  if (tab === 'trending') {
    return (
      <div className="grid min-h-[160px] place-items-center rounded-lg border border-dashed border-[#d9deea] bg-[#fbfcff] p-6 text-center">
        <div className="max-w-md">
          <p className="text-sm font-semibold text-[#392ee5]">{messages.home.feedComingSoon}</p>
          <p className="mt-1.5 text-sm text-[#667085]">{messages.home.feedComingSoonBody}</p>
        </div>
      </div>
    );
  }

  const papers = await papersForTab(runId, tab);
  const resolvedSession = await session;
  const paperStates = resolvedSession
    ? await libraryRepo.findPaperStates({
        userId: resolvedSession.user.id,
        paperIds: papers.map((paper) => paper.id),
      })
    : new Map<string, { liked: boolean; readLater: boolean; status: string }>();

  return (
    <>
      {papers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#d9deea] bg-[#fbfcff] p-6 text-sm text-[#667085]">
          {messages.home.feedNoResults}
        </div>
      ) : (
        papers.map((paper, index) => (
          <PaperFeedCard
            key={paper.id}
            paper={paper}
            index={index}
            locale={locale}
            messages={messages}
            userState={{
              liked: paperStates.get(paper.id)?.liked ?? false,
              readLater: paperStates.get(paper.id)?.readLater ?? false,
            }}
          />
        ))
      )}
    </>
  );
}

function FeedSection({
  run,
  data,
  activeTab,
  searchParams,
  locale,
  messages,
  latestCount,
  latestUpdatedAt,
}: {
  run: NonNullable<Awaited<ReturnType<typeof runsRepo.latestCompletedForDisplay>>>;
  data: HomeDataPromises;
  activeTab: FeedTab;
  searchParams: Awaited<HomePageProps['searchParams']>;
  locale: Locale;
  messages: Messages;
  latestCount: number;
  latestUpdatedAt: string;
}) {
  return (
    <section
      className="rounded-[10px] border border-[#e5e9f3] bg-white shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
      aria-labelledby="feed-title"
    >
      <FeedToolbar
        activeTab={activeTab}
        searchParams={searchParams}
        messages={messages}
        latestCount={latestCount}
        latestUpdatedAt={latestUpdatedAt}
      />
      <div className="sr-only" id="feed-title">
        {messages.home.feedTitleSr}
      </div>
      <div className="grid grid-cols-1 gap-3.5 px-5 py-4">
        <Suspense key={activeTab} fallback={<FeedResultsLoading messages={messages} />}>
          <FeedResults
            runId={run.id}
            tab={activeTab}
            session={data.session}
            locale={locale}
            messages={messages}
          />
        </Suspense>
        <Link
          href="/papers"
          className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#d9deea] bg-[#fbfcff] py-3 text-sm font-bold text-[#392ee5] hover:bg-[#f2f4ff]"
        >
          {messages.home.feedViewAllPapers}
        </Link>
      </div>
    </section>
  );
}

async function HotTagsSection({
  tagDistribution,
  messages,
}: {
  tagDistribution: Promise<TagCount[]>;
  messages: Messages;
}) {
  return <HotTagsCard tags={await tagDistribution} messages={messages} />;
}

async function RecentRecommendationsSection({
  recommended,
  messages,
}: {
  recommended: Promise<RunResultWithDetail[]>;
  messages: Messages;
}) {
  const resolvedRecommended = await recommended;
  return resolvedRecommended.length > 0 ? (
    <RecentRecommendationsCard recommended={resolvedRecommended} messages={messages} />
  ) : null;
}

async function SourceMixSection({
  sourceDistribution,
  messages,
}: {
  sourceDistribution: Promise<SourceCount[]>;
  messages: Messages;
}) {
  return <SourceMixCard sources={await sourceDistribution} messages={messages} />;
}

async function HomePageContent({
  searchParams,
  locale,
}: {
  searchParams: Awaited<HomePageProps['searchParams']>;
  locale: Locale;
}) {
  const run = await runsRepo.latestCompletedForDisplay();
  const messages = getMessages(locale);
  if (!run) return <EmptyState messages={messages} />;

  const activeTab = parseTab(searchParams.tab);
  // 最新發佈 badge: how many papers the latest run surfaced, and when it landed.
  const latestCount = await runResultsRepo.countByRun(run.id);
  const latestUpdatedAt = formatDateTime(run.completedAt ?? run.createdAt);
  const data: HomeDataPromises = {
    summary: trendsRepo.getRunSummary(run.id),
    sourceDistribution: trendsRepo.getSourceDistribution(),
    tagDistribution: trendsRepo.getTagDistribution(),
    recommended: runResultsRepo.findByRunWithDetail(run.id, {
      recommendedOnly: true,
      limit: 3,
    }),
    session: getCurrentSession(),
  };

  return (
    <main className="mx-auto max-w-[1760px] px-4 py-4 sm:px-6 lg:px-12">
      <Suspense fallback={<HeroLoading messages={messages} />}>
        <HeroSection summary={data.summary} messages={messages} />
      </Suspense>

      <div className="mt-5 grid grid-cols-1 gap-9 xl:grid-cols-[minmax(0,1fr)_390px]">
        <FeedSection
          run={run}
          data={data}
          activeTab={activeTab}
          searchParams={searchParams}
          locale={locale}
          messages={messages}
          latestCount={latestCount}
          latestUpdatedAt={latestUpdatedAt}
        />

        <aside className="grid content-start gap-3" aria-label={messages.home.sidebarAria}>
          <Suspense
            fallback={<LoadingPanel label={messages.home.loadingHotTags} minHeight={132} />}
          >
            <HotTagsSection tagDistribution={data.tagDistribution} messages={messages} />
          </Suspense>
          <Suspense
            fallback={
              <LoadingPanel label={messages.home.loadingRecommendations} minHeight={156} />
            }
          >
            <RecentRecommendationsSection recommended={data.recommended} messages={messages} />
          </Suspense>
          <Suspense
            fallback={<LoadingPanel label={messages.home.loadingSourceMix} minHeight={132} />}
          >
            <SourceMixSection
              sourceDistribution={data.sourceDistribution}
              messages={messages}
            />
          </Suspense>
          <PersonalCard messages={messages} />
        </aside>
      </div>
    </main>
  );
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const sp = await searchParams;
  const locale = await getLocale(sp);

  return (
    <Suspense fallback={<HomePagePlaceholder />}>
      <HomePageContent searchParams={sp} locale={locale} />
    </Suspense>
  );
}

import 'server-only';

import Link from 'next/link';
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
import { formatDate } from '@/lib/format';
import { getLocale, type Locale } from '@/lib/locale';
import { formatConferenceLabel, formatSourceLabel } from '@/lib/source-label';
import { getMessages, type Messages } from '@/i18n';
import { getCurrentSession } from '@/server/auth/current-user';
import { libraryRepo } from '@/server/repos/library';
import { PaperFeedCard } from '@/components/paper-feed-card';
import { FeedControls, type FeedControlsLabels } from '@/components/feed-controls';

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

type TimeKey = 'all' | 'week' | 'month' | 'year';

// The four home-feed tabs: 為你推薦 / 熱門趨勢 / 最新發佈 / 高分推薦.
type FeedTab = 'recommended' | 'trending' | 'latest' | 'top';

interface FeedFilters {
  domain: string;
  time: TimeKey;
}

interface HomePageProps {
  searchParams: Promise<{
    locale?: string;
    domain?: string;
    time?: string;
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

function parseTimeParam(value: string | undefined): TimeKey {
  return value === 'week' || value === 'month' || value === 'year' ? value : 'all';
}

function parseTab(value: string | undefined): FeedTab {
  return value === 'trending' || value === 'latest' || value === 'top' ? value : 'recommended';
}

function timeCutoff(time: TimeKey): Date | null {
  if (time === 'all') return null;
  const days = time === 'week' ? 7 : time === 'month' ? 30 : 365;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function paperDate(paper: PaperCardPayload): Date | null {
  const raw = paper.publishedDate ?? paper.createdAt;
  return raw ? new Date(raw) : null;
}

function paperConference(paper: PaperCardPayload): string | null {
  const venue = paper.venue?.trim();
  return venue ? formatConferenceLabel(venue) : null;
}

function applyFeedFilters(
  papers: PaperCardPayload[],
  filters: FeedFilters,
): PaperCardPayload[] {
  let out = papers;
  if (filters.domain) {
    out = out.filter((p) => paperConference(p) === filters.domain);
  }
  const cutoff = timeCutoff(filters.time);
  if (cutoff) {
    out = out.filter((p) => {
      const date = paperDate(p);
      return date != null && date >= cutoff;
    });
  }
  return out;
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
 * Resolve the papers shown for the active feed tab (post domain/time filter):
 * - recommended (為你推薦): a random handful of the latest run, reshuffled each request.
 * - latest (最新發佈): newest published date first, from the latest run.
 * - top (高分推薦): a random handful of all papers scoring >= 7.5.
 * - trending (熱門趨勢): not yet available (needs reader views) — handled by the
 *   coming-soon panel, never reaches here.
 */
async function papersForTab(runId: string, tab: FeedTab, filters: FeedFilters) {
  if (tab === 'top') {
    const pool = applyFeedFilters(await papersRepo.listHighScoreCards(HIGH_SCORE_MIN), filters);
    return sampleRandom(pool, HOME_FEED_COUNT);
  }
  const runCards = (
    await runResultsRepo.findByRunWithDetail(runId, { recommendedOnly: false })
  ).map((result) => result.paper);
  const matched = applyFeedFilters(runCards, filters);
  if (tab === 'latest') {
    return [...matched]
      .sort((a, b) => (paperDate(b)?.getTime() ?? 0) - (paperDate(a)?.getTime() ?? 0))
      .slice(0, HOME_FEED_COUNT);
  }
  // recommended (default)
  return sampleRandom(matched, HOME_FEED_COUNT);
}

function buildFeedHref(
  searchParams: Awaited<HomePageProps['searchParams']>,
  tab: FeedTab,
): string {
  const params = new URLSearchParams();
  if (searchParams.locale) params.set('locale', searchParams.locale);
  if (searchParams.domain) params.set('domain', searchParams.domain);
  if (searchParams.time) params.set('time', searchParams.time);
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

      <div className="mt-5 grid gap-9 xl:grid-cols-[minmax(0,1fr)_390px]">
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

function HeroArt() {
  return (
    <div className="relative min-h-[176px]" aria-hidden>
      <div className="absolute top-1 left-[8%] h-[157px] w-[188px] overflow-hidden rounded-[9px] bg-white shadow-[0_22px_55px_rgba(83,88,135,0.16)] max-sm:left-0 max-sm:w-[205px]">
        <div className="h-5 bg-[#dbc9ff]" />
        <div className="absolute top-2.5 left-4 flex gap-2">
          <i className="h-1.5 w-1.5 rounded-full bg-[#6c63ff]" />
          <i className="h-1.5 w-1.5 rounded-full bg-[#77d5cc]" />
          <i className="h-1.5 w-1.5 rounded-full bg-[#99a2ff]" />
        </div>
        <div className="absolute top-[34px] left-[19px] grid h-7 w-7 place-items-center rounded-lg bg-[#eef0ff] text-[#8174ff]">
          <Shield aria-hidden className="h-4 w-4" />
        </div>
        <div className="absolute top-9 right-5 left-[58px] grid gap-[13px]">
          <i className="h-[7px] w-[62px] rounded-full bg-[#b8a4ff]" />
          <i className="h-[7px] w-[108px] rounded-full bg-[#e4e7f1]" />
          <i className="h-[7px] w-[83px] rounded-full bg-[#e4e7f1]" />
          <i className="h-[7px] w-[96px] rounded-full bg-[#e4e7f1]" />
        </div>
        <div className="absolute bottom-[31px] left-[19px] flex h-11 items-end gap-1">
          {[29, 38, 26, 44, 33].map((height) => (
            <i
              key={height}
              className="w-[9px] rounded-t-[3px] bg-gradient-to-b from-[#9cb2ff] to-[#6f7df7]"
              style={{ height }}
            />
          ))}
        </div>
      </div>
      <div className="absolute top-[77px] right-[5%] grid min-h-[66px] w-[178px] grid-cols-[38px_1fr] items-center gap-3 rounded-[9px] bg-white/90 p-3.5 shadow-[0_18px_42px_rgba(83,88,135,0.14)] max-sm:right-0 max-sm:w-[190px]">
        <div className="grid h-[38px] w-[38px] place-items-center rounded-[13px] bg-[#eef0ff] text-[#5b4df1]">
          <Sparkles aria-hidden className="h-6 w-6" />
        </div>
        <div className="grid gap-[9px]">
          <i className="h-[7px] rounded-full bg-[#dfe3ef]" />
          <i className="h-[7px] rounded-full bg-[#dfe3ef]" />
          <i className="h-[7px] rounded-full bg-[#dfe3ef]" />
        </div>
      </div>
    </div>
  );
}

function TopicChips({ tags, label }: { tags: TagCount[]; label: string }) {
  const topics = tags.length > 0 ? tags.map((t) => t.tag) : TOPIC_FALLBACKS;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#5f6b7a]">
      <span>{label}</span>
      {topics.slice(0, 7).map((topic) => (
        <Link
          key={topic}
          href={`/library?tags=${encodeURIComponent(topic)}`}
          className="inline-flex min-h-[27px] items-center rounded-full bg-[#dfe4ff] px-3.5 text-[13px] font-bold text-[#2734b7]"
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
      className="grid min-h-[216px] items-center gap-10 rounded-[10px] bg-[radial-gradient(circle_at_68%_30%,rgba(151,124,255,0.22),transparent_22%),linear-gradient(100deg,#edf7ff_0%,#f8f0ff_51%,#eaf4ff_100%)] px-5 py-6 shadow-[0_18px_50px_rgba(31,42,68,0.08)] md:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.92fr)] lg:px-24 xl:px-44"
      aria-labelledby="hero-title"
    >
      <div className="max-w-[700px]">
        <h1
          id="hero-title"
          className="mb-3.5 text-[29px] leading-[1.12] font-extrabold tracking-normal text-[#111827] md:text-[34px]"
        >
          {t.heroTitle}
        </h1>
        <p className="mb-5 text-sm text-[#273142]">{t.heroSubtitle}</p>
        <label className="grid min-h-[54px] grid-cols-[auto_1fr_auto] items-center gap-3.5 rounded-[9px] border border-[#d9deea] bg-white pr-2 pl-5 shadow-[0_12px_26px_rgba(45,52,88,0.14)] max-sm:grid-cols-[auto_1fr] max-sm:p-3">
          <Sparkles aria-hidden className="h-5 w-5 text-[#5b4df1]" />
          <input
            type="text"
            aria-label={t.heroSearchAria}
            placeholder={t.heroSearchPlaceholder}
            className="min-w-0 border-0 bg-transparent text-[15px] text-[#475467] outline-none placeholder:text-[#98a2b3]"
          />
          <button
            type="button"
            disabled
            aria-label={t.heroSubmitAria}
            title={t.heroSubmitTitle}
            className="grid h-[38px] w-[38px] cursor-not-allowed place-items-center rounded-[7px] bg-gradient-to-br from-[#7868ff] to-[#4437e7] text-white shadow-[0_10px_24px_rgba(91,77,241,0.28)] max-sm:col-span-2 max-sm:w-full"
          >
            <ArrowRight aria-hidden className="h-5 w-5" />
          </button>
        </label>
        <TopicChips tags={summary.topTags} label={t.heroTopicsLabel} />
      </div>
      <HeroArt />
    </section>
  );
}

function FeedTabs({
  activeTab,
  searchParams,
  messages,
}: {
  activeTab: FeedTab;
  searchParams: Awaited<HomePageProps['searchParams']>;
  messages: Messages;
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
          </Link>
        );
      })}
    </div>
  );
}

function feedControlLabels(messages: Messages): FeedControlsLabels {
  const t = messages.home;
  return {
    controlsAria: t.feedControlsAria,
    domainAria: t.feedFilterDomain,
    domainAll: t.feedFilterDomain,
    timeAria: t.feedFilterTime,
    timeAll: t.feedFilterTime,
    timeWeek: t.feedTimeWeek,
    timeMonth: t.feedTimeMonth,
    timeYear: t.feedTimeYear,
  };
}

const FEED_TOOLBAR_CLASS =
  'flex items-center justify-between gap-4 border-b border-[#e5e9f3] px-5 pt-2.5 max-lg:flex-col max-lg:items-stretch';

function FeedToolbarFallback({
  filters,
  activeTab,
  searchParams,
  messages,
}: {
  filters: FeedFilters;
  activeTab: FeedTab;
  searchParams: Awaited<HomePageProps['searchParams']>;
  messages: Messages;
}) {
  return (
    <div className={FEED_TOOLBAR_CLASS}>
      <FeedTabs activeTab={activeTab} searchParams={searchParams} messages={messages} />
      <FeedControls
        domain={filters.domain}
        time={filters.time}
        domainOptions={[]}
        labels={feedControlLabels(messages)}
      />
    </div>
  );
}

async function FeedToolbar({
  summary,
  filters,
  activeTab,
  searchParams,
  messages,
}: {
  summary: Promise<RunSummary>;
  filters: FeedFilters;
  activeTab: FeedTab;
  searchParams: Awaited<HomePageProps['searchParams']>;
  messages: Messages;
}) {
  const domainOptions = (await summary).topConferences.map((c) => c.tag);
  return (
    <div className={FEED_TOOLBAR_CLASS}>
      <FeedTabs activeTab={activeTab} searchParams={searchParams} messages={messages} />
      <FeedControls
        domain={filters.domain}
        time={filters.time}
        domainOptions={domainOptions}
        labels={feedControlLabels(messages)}
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
              href={`/library?tags=${encodeURIComponent(tag.tag)}`}
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
  filters,
  tab,
  session,
  locale,
  messages,
}: {
  runId: string;
  filters: FeedFilters;
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

  const papers = await papersForTab(runId, tab, filters);
  const resolvedSession = await session;
  const paperStates = resolvedSession
    ? await libraryRepo.findPaperStates({
        userId: resolvedSession.user.id,
        paperIds: papers.map((paper) => paper.id),
      })
    : new Map<string, { liked: boolean; status: string }>();

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
              readLater: paperStates.get(paper.id)?.status === 'UNREAD',
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
  filters,
  activeTab,
  searchParams,
  locale,
  messages,
}: {
  run: NonNullable<Awaited<ReturnType<typeof runsRepo.latestCompletedForDisplay>>>;
  data: HomeDataPromises;
  filters: FeedFilters;
  activeTab: FeedTab;
  searchParams: Awaited<HomePageProps['searchParams']>;
  locale: Locale;
  messages: Messages;
}) {
  return (
    <section
      className="rounded-[10px] border border-[#e5e9f3] bg-white shadow-[0_18px_50px_rgba(31,42,68,0.08)]"
      aria-labelledby="feed-title"
    >
      <Suspense
        fallback={
          <FeedToolbarFallback
            filters={filters}
            activeTab={activeTab}
            searchParams={searchParams}
            messages={messages}
          />
        }
      >
        <FeedToolbar
          summary={data.summary}
          filters={filters}
          activeTab={activeTab}
          searchParams={searchParams}
          messages={messages}
        />
      </Suspense>
      <div className="sr-only" id="feed-title">
        {messages.home.feedTitleSr}
      </div>
      <div className="grid gap-3.5 px-5 py-4">
        <Suspense key={activeTab} fallback={<FeedResultsLoading messages={messages} />}>
          <FeedResults
            runId={run.id}
            filters={filters}
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

  const filters: FeedFilters = {
    domain: searchParams.domain ?? '',
    time: parseTimeParam(searchParams.time),
  };
  const activeTab = parseTab(searchParams.tab);
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

      <div className="mt-5 grid gap-9 xl:grid-cols-[minmax(0,1fr)_390px]">
        <FeedSection
          run={run}
          data={data}
          filters={filters}
          activeTab={activeTab}
          searchParams={searchParams}
          locale={locale}
          messages={messages}
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

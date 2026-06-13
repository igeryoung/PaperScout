import 'server-only';

import { Suspense } from 'react';
import { FileSearch } from 'lucide-react';
import { papersRepo, type PaperSort } from '@/server/repos/papers';
import { getLocale, type Locale } from '@/lib/locale';
import { getMessages, type Messages } from '@/i18n';
import { PaperFeedCard } from '@/components/paper-feed-card';
import { Pagination } from '@/components/pagination';
import { PapersToolbar } from './papers-toolbar';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 10;

interface PapersPageProps {
  searchParams: Promise<{
    q?: string;
    venue?: string;
    tag?: string;
    sort?: string;
    page?: string;
    locale?: string;
  }>;
}

function parsePage(value: string | undefined): number {
  if (!value) return 1;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseSort(value: string | undefined): PaperSort {
  return value === 'oldest' || value === 'score' ? value : 'newest';
}

function buildPapersHref(
  filters: { q?: string; venue?: string; tag?: string; sort: PaperSort },
  page: number,
): string {
  const sp = new URLSearchParams();
  if (filters.q) sp.set('q', filters.q);
  if (filters.venue) sp.set('venue', filters.venue);
  if (filters.tag) sp.set('tag', filters.tag);
  if (filters.sort !== 'newest') sp.set('sort', filters.sort);
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `/papers?${qs}` : '/papers';
}

function EmptyResults({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="grid min-h-[260px] place-items-center rounded-[10px] border border-dashed border-[#d9deea] bg-white p-10 text-center">
      <div className="max-w-md">
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-[#eef0ff] text-[#5b4df1]">
          <FileSearch aria-hidden className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-[#111827]">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-[#667085]">{body}</p>
      </div>
    </div>
  );
}

function ResultsLoading({ label }: { label: string }) {
  return (
    <div className="grid gap-3.5" role="status" aria-label={label}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-1 gap-4 rounded-[10px] border border-[#dfe5ee] bg-white p-4 xl:grid-cols-[280px_minmax(0,1fr)]"
        >
          <div className="h-44 animate-pulse rounded-lg bg-[#edf1f7]" />
          <div className="space-y-3">
            <div className="h-5 w-4/5 animate-pulse rounded bg-[#edf1f7]" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-[#edf1f7]" />
            <div className="h-16 animate-pulse rounded bg-[#edf1f7]" />
          </div>
        </div>
      ))}
    </div>
  );
}

async function PapersResults({
  q,
  venue,
  tag,
  sort,
  page,
  locale,
  messages,
}: {
  q: string;
  venue?: string;
  tag?: string;
  sort: PaperSort;
  page: number;
  locale: Locale;
  messages: Messages;
}) {
  const t = messages.papers;
  const result = await papersRepo.listAllPapers({
    q,
    venue,
    tag,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  if (result.papers.length === 0) {
    const filtered = Boolean(q || venue || tag);
    return (
      <EmptyResults
        title={filtered ? t.noResultsTitle : t.emptyTitle}
        body={filtered ? t.noResultsBody : t.emptyBody}
      />
    );
  }

  return (
    <div className="grid gap-3.5">
      {result.papers.map((paper, index) => (
        <PaperFeedCard
          key={paper.id}
          paper={paper}
          index={index}
          locale={locale}
          messages={messages}
          showReason
          showActions={false}
        />
      ))}
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        totalItems={result.total}
        labels={{
          allShown: messages.home.paginationAllShown,
          status: messages.home.paginationStatus,
          prev: messages.home.paginationPrev,
          next: messages.home.paginationNext,
          aria: messages.home.paginationAria,
        }}
        buildHref={(targetPage) => buildPapersHref({ q, venue, tag, sort }, targetPage)}
      />
    </div>
  );
}

export default async function PapersPage({ searchParams }: PapersPageProps) {
  const sp = await searchParams;
  const locale = await getLocale(sp);
  const messages = getMessages(locale);
  const t = messages.papers;

  const q = typeof sp.q === 'string' ? sp.q : '';
  const venue = typeof sp.venue === 'string' && sp.venue ? sp.venue : undefined;
  const tag = typeof sp.tag === 'string' && sp.tag ? sp.tag : undefined;
  const sort = parseSort(sp.sort);
  const page = parsePage(sp.page);

  const [conferences, tags] = await Promise.all([
    papersRepo.listConferenceFacets(),
    papersRepo.listTagFacets(),
  ]);

  return (
    <main className="mx-auto max-w-[1760px] px-4 py-6 sm:px-6 lg:px-12">
      <section className="relative overflow-hidden rounded-[14px] bg-[#e7e4fb] bg-[url(/all-paper-hero.png)] bg-cover bg-center bg-no-repeat px-6 py-9 shadow-[0_20px_55px_rgba(46,42,92,0.12)] sm:px-10 sm:py-11">
        <div className="relative max-w-[640px]">
          <h1 className="text-[30px] leading-tight font-extrabold tracking-tight text-[#1b1f3b] sm:text-[36px]">
            {t.title}
          </h1>
          <p className="mt-2.5 max-w-[540px] text-sm leading-6 text-[#4c4f78] sm:text-[15px]">
            {t.subtitle}
          </p>
        </div>
      </section>

      <div className="mt-5 mb-8 grid gap-4 rounded-[16px] border border-[#e4e7f3] bg-white p-4 shadow-[0_8px_24px_rgba(40,48,80,0.06)] sm:p-5">
        <div className="rounded-[12px] border border-[#e7eaf3] bg-[#f7f8fc] p-3 sm:p-3.5">
          <PapersToolbar
            query={q}
            venue={venue}
            tag={tag}
            sort={sort}
            conferences={conferences}
            tags={tags}
            labels={{
              searchPlaceholder: t.searchPlaceholder,
              searchAria: t.searchAria,
              searchSubmit: t.searchSubmit,
              conferenceAll: t.conferenceAll,
              conferenceAria: t.conferenceAria,
              tagAll: t.tagAll,
              tagAria: t.tagAria,
              tagSearchPlaceholder: t.tagSearchPlaceholder,
              tagNoResults: t.tagNoResults,
              sortAria: t.sortAria,
              sortNewest: t.sortNewest,
              sortOldest: t.sortOldest,
              sortScore: t.sortScore,
              reset: t.reset,
            }}
          />
        </div>

        <Suspense
          key={`${q}|${venue ?? ''}|${tag ?? ''}|${sort}|${page}`}
          fallback={<ResultsLoading label={t.loading} />}
        >
          <PapersResults
            q={q}
            venue={venue}
            tag={tag}
            sort={sort}
            page={page}
            locale={locale}
            messages={messages}
          />
        </Suspense>
      </div>
    </main>
  );
}

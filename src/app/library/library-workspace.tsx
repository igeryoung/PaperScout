'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  AlertTriangle,
  BookMarked,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  FileText,
  Folder,
  Heart,
  History,
  MessageSquare,
  Minus,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import type { Source, UserPaperStatus } from '@prisma/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { cn } from '@/lib/utils';

type CollectionView = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  count: number;
};

type PaperView = {
  id: string;
  title: string;
  authors: string;
  source: Source;
  sourceLabel: string;
  publishedDate: string;
  storedDate: string;
  publishedAt: number;
  storedAt: number;
  viewedAt: number;
  pdfUrl: string | null;
  score: number | null;
  summary: string;
  tags: string[];
  hasFigure: boolean;
  liked: boolean;
  status: UserPaperStatus;
  note: string;
  noteCount: number;
  lastViewedAt: string | null;
};

export type LibraryWorkspaceProps = {
  locale: 'en' | 'zh-TW';
  labels: {
    title: string;
    subtitle: string;
    allPapers: string;
    liked: string;
    history: string;
    collections: string;
    newList: string;
    newListPlaceholder: string;
    createList: string;
    manageList: string;
    renameList: string;
    deleteList: string;
    deleteListWarning: string;
    cancel: string;
    addPapers: string;
    addToList: string;
    addToListHeading: string;
    removeFromList: string;
    removeFromLibrary: string;
    openPaper: string;
    notePlaceholder: string;
    saveNote: string;
    emptyTitle: string;
    emptyBody: string;
    searchPlaceholder: string;
    statusFilterAll: string;
    statusFilterAria: string;
    tagFilterAll: string;
    tagFilterAria: string;
    tagSearchPlaceholder: string;
    tagNoResults: string;
    sortAria: string;
    sortRecent: string;
    sortAdded: string;
    sortScore: string;
    reset: string;
    statusLabel: string;
    likedLabel: string;
    lastViewed: string;
    paginationPrev: string;
    paginationNext: string;
    paginationRange: (from: number, to: number, total: number) => string;
    libraryHeading: string;
    readingStatusHeading: string;
    aiSummary: string;
    updateFailed: string;
    metrics: {
      total: string;
      unread: string;
      reading: string;
      read: string;
      notes: string;
    };
    metricsHelp: {
      total: string;
      unread: string;
      reading: string;
      read: string;
      notes: string;
    };
    statuses: Record<UserPaperStatus, string>;
    sources: Record<Source, string>;
  };
  activeView: 'all' | 'liked' | 'history' | 'collection';
  activeCollectionId: string | null;
  activeStatus: UserPaperStatus | null;
  collections: CollectionView[];
  stats: {
    total: number;
    liked: number;
    unread: number;
    reading: number;
    read: number;
    notes: number;
    history: number;
  };
  papers: PaperView[];
};

const STATUS_OPTIONS: UserPaperStatus[] = ['UNREAD', 'READING', 'READ', 'ARCHIVED'];

const PAGE_SIZE = 10;

const ALL = '__all__';

type StatusFilter = UserPaperStatus | typeof ALL;
type LibrarySort = 'recent' | 'added' | 'score';

const filterTriggerClass =
  'h-9 gap-2 rounded-[7px] border-[#d9e0ea] bg-white px-[13px] text-[13px] font-bold text-[#344054]';

function statusHref(status?: UserPaperStatus) {
  return status ? `/library?status=${status}` : '/library';
}

function statusTone(status: UserPaperStatus) {
  if (status === 'READ') return 'border-[#cfe9df] bg-[#e9f7f2] text-[#087d6c]';
  if (status === 'READING') return 'border-[#d7d3ff] bg-[#eeedff] text-[#5848f5]';
  if (status === 'ARCHIVED') return 'border-[#e2e7ef] bg-[#f2f4f8] text-[#667085]';
  return 'border-[#f3dfb8] bg-[#fff7e6] text-[#9a6500]';
}

function SidebarItem({
  href,
  active,
  icon,
  label,
  count,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'grid h-9 grid-cols-[24px_1fr_auto] items-center gap-2 rounded-lg px-3 text-sm font-bold text-[#4d5a6c] hover:bg-[#f5f7fb]',
        active && 'bg-[#efedff] text-[#5848f5]',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      <span className="text-xs font-semibold">{count}</span>
    </Link>
  );
}

async function jsonRequest(url: string, init: RequestInit = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
}

function Thumb({ paper }: { paper: PaperView }) {
  if (paper.hasFigure) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/api/papers/${paper.id}/figure`}
        alt=""
        loading="lazy"
        className="h-[146px] w-full rounded-lg border border-[#e2e7ef] object-cover"
      />
    );
  }
  return (
    <div className="grid h-[146px] w-full place-items-center rounded-lg border border-[#e2e7ef] bg-[linear-gradient(180deg,#fbfcff,#f4f7fb)]">
      <div className="relative h-[132px] w-[150px] rounded-sm border border-[#cad4e2] bg-[linear-gradient(90deg,transparent_31%,#d8dee8_31%_32%,transparent_32%_64%,#d8dee8_64%_65%,transparent_65%),linear-gradient(#f2f5f9_0_20px,transparent_20px),#f8fafc] shadow-[0_6px_16px_rgba(48,60,90,0.1)]">
        <span className="absolute top-[58px] left-[18px] h-6 w-[30px] rounded-sm border border-[#aab5c5] bg-[#dde7f8]" />
        <span className="absolute top-[52px] left-[73px] h-[30px] w-8 rounded-sm border border-[#aab5c5] bg-[#bde0b6]" />
        <span className="absolute top-[52px] left-[109px] h-[30px] w-[29px] rounded-sm border border-[#98a7bb] bg-[#bfd8f2]" />
        <span className="absolute top-[70px] left-[47px] h-px w-[27px] bg-[#9aa8ba]" />
        <span className="absolute top-[67px] left-[105px] h-px w-[17px] bg-[#9aa8ba]" />
      </div>
    </div>
  );
}

export function LibraryWorkspace({
  labels,
  activeView,
  activeCollectionId,
  activeStatus,
  collections,
  stats,
  papers,
}: LibraryWorkspaceProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(ALL);
  const [tagFilter, setTagFilter] = useState<string>(ALL);
  const [sort, setSort] = useState<LibrarySort>('recent');
  const [page, setPage] = useState(1);
  const [newListName, setNewListName] = useState('');
  const [renameTarget, setRenameTarget] = useState<CollectionView | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CollectionView | null>(null);

  const activeCollection = collections.find((collection) => collection.id === activeCollectionId);
  const title =
    activeView === 'liked'
      ? labels.liked
      : activeView === 'history'
        ? labels.history
        : activeView === 'collection' && activeCollection
          ? activeCollection.name
          : labels.title;

  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const paper of papers) {
      for (const tag of paper.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag, count]) => ({ value: tag, label: `${tag} · ${count}` }));
  }, [papers]);

  const filteredPapers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matched = papers.filter((paper) => {
      if (statusFilter !== ALL && paper.status !== statusFilter) return false;
      if (tagFilter !== ALL && !paper.tags.includes(tagFilter)) return false;
      if (
        needle &&
        ![paper.title, paper.authors, paper.source, paper.summary, ...paper.tags]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      ) {
        return false;
      }
      return true;
    });
    return matched.sort((a, b) => {
      if (sort === 'score') return (b.score ?? -1) - (a.score ?? -1);
      if (sort === 'added') return b.storedAt - a.storedAt;
      return b.viewedAt - a.viewedAt;
    });
  }, [papers, query, statusFilter, tagFilter, sort]);

  // Reset to the first page whenever the filters or active view change
  // (render-time state adjustment, per the React "you might not need an effect" guidance).
  const filterKey = `${query}|${statusFilter}|${tagFilter}|${sort}|${activeView}|${activeCollectionId}`;
  const [lastFilterKey, setLastFilterKey] = useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filteredPapers.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedPapers = useMemo(
    () => filteredPapers.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredPapers, currentPage],
  );
  const rangeFrom = filteredPapers.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeTo = Math.min(currentPage * PAGE_SIZE, filteredPapers.length);

  const hasFilters =
    query.trim().length > 0 || statusFilter !== ALL || tagFilter !== ALL || sort !== 'recent';

  const tagTriggerLabel = tagFilter === ALL ? labels.tagFilterAll : tagFilter;

  const resetFilters = () => {
    setQuery('');
    setStatusFilter(ALL);
    setTagFilter(ALL);
    setSort('recent');
  };

  const refresh = () => {
    startRefresh(() => router.refresh());
  };

  const runMutation = async (mutate: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await mutate();
      refresh();
    } catch {
      setError(labels.updateFailed);
    } finally {
      setBusy(false);
    }
  };

  const createList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    void runMutation(async () => {
      await jsonRequest('/api/library/lists', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      setNewListName('');
    });
  };

  const updatePaper = (paperId: string, patch: { liked?: boolean; status?: UserPaperStatus }) => {
    void runMutation(async () => {
      await jsonRequest(`/api/library/papers/${paperId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
    });
  };

  const addPaperToList = (paperId: string, collectionId: string) => {
    void runMutation(async () => {
      await jsonRequest(`/api/library/papers/${paperId}`, {
        method: 'POST',
        body: JSON.stringify({ collectionId }),
      });
    });
  };

  const removeFromCurrentList = (paperId: string) => {
    if (!activeCollectionId) return;
    void runMutation(async () => {
      await jsonRequest(`/api/library/papers/${paperId}`, {
        method: 'DELETE',
        body: JSON.stringify({ collectionId: activeCollectionId }),
      });
    });
  };

  const removeFromLibrary = (paperId: string) => {
    void runMutation(async () => {
      await jsonRequest(`/api/library/papers/${paperId}`, {
        method: 'DELETE',
        body: JSON.stringify({ collectionId: null }),
      });
    });
  };

  const openRename = (collection: CollectionView) => {
    setRenameValue(collection.name);
    setRenameTarget(collection);
  };

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = renameTarget;
    if (!target) return;
    const name = renameValue.trim();
    if (!name || name === target.name) {
      setRenameTarget(null);
      return;
    }
    void runMutation(async () => {
      await jsonRequest(`/api/library/lists/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
      setRenameTarget(null);
    });
  };

  const confirmDelete = () => {
    const target = deleteTarget;
    if (!target) return;
    const wasActive = activeView === 'collection' && activeCollectionId === target.id;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        await jsonRequest(`/api/library/lists/${target.id}`, { method: 'DELETE' });
        setDeleteTarget(null);
        if (wasActive) {
          router.push('/library');
        } else {
          refresh();
        }
      } catch {
        setError(labels.updateFailed);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <main className="grid min-h-[calc(100vh-73px)] min-w-[1180px] grid-cols-[282px_1fr] bg-[#f8faff] text-[#121826]">
      <aside className="border-r border-[#dde3ee] bg-white/60 px-[21px] py-[29px]">
        <section className="mb-[19px] border-b border-[#e4e9f2] pb-[22px]">
          <h2 className="mx-[14px] mb-[14px] text-sm font-extrabold text-[#334155]">
            {labels.libraryHeading}
          </h2>
          <div className="grid gap-1">
            <SidebarItem
              href="/library"
              active={activeView === 'all' && !activeStatus}
              icon={<BookMarked aria-hidden className="h-4 w-4" />}
              label={labels.title}
              count={stats.total}
            />
            <SidebarItem
              href="/library?view=liked"
              active={activeView === 'liked'}
              icon={<Heart aria-hidden className="h-4 w-4" />}
              label={labels.liked}
              count={stats.liked}
            />
            <SidebarItem
              href="/library?view=history"
              active={activeView === 'history'}
              icon={<History aria-hidden className="h-4 w-4" />}
              label={labels.history}
              count={stats.history}
            />
          </div>
        </section>

        <section className="mb-[19px] border-b border-[#e4e9f2] pb-[22px]">
          <h2 className="mx-[14px] mb-[14px] text-sm font-extrabold text-[#334155]">
            {labels.readingStatusHeading}
          </h2>
          <div className="grid gap-1">
            <SidebarItem
              href={statusHref()}
              active={!activeStatus && activeView === 'all'}
              icon={<FileText aria-hidden className="h-4 w-4" />}
              label={labels.allPapers}
              count={stats.total}
            />
            <SidebarItem
              href={statusHref('UNREAD')}
              active={activeStatus === 'UNREAD'}
              icon={<Clock3 aria-hidden className="h-4 w-4" />}
              label={labels.statuses.UNREAD}
              count={stats.unread}
            />
            <SidebarItem
              href={statusHref('READING')}
              active={activeStatus === 'READING'}
              icon={<BookOpen aria-hidden className="h-4 w-4" />}
              label={labels.statuses.READING}
              count={stats.reading}
            />
            <SidebarItem
              href={statusHref('READ')}
              active={activeStatus === 'READ'}
              icon={<CheckCircle2 aria-hidden className="h-4 w-4" />}
              label={labels.statuses.READ}
              count={stats.read}
            />
          </div>
        </section>

        <section>
          <div className="mx-[11px] mb-[13px] flex flex-col gap-2">
            <h2 className="text-sm font-extrabold text-[#334155]">{labels.collections}</h2>
            <form onSubmit={createList} className="flex items-center gap-1">
              <input
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                placeholder={labels.newListPlaceholder}
                className="h-7 min-w-0 flex-1 rounded-md border border-[#d9e0ea] bg-white px-2 text-xs outline-none focus:border-[#5b4df1]"
              />
              <button
                type="submit"
                disabled={busy || isRefreshing}
                className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-extrabold text-[#5848f5] disabled:opacity-50"
              >
                <Plus aria-hidden className="h-3.5 w-3.5" />
                {labels.createList}
              </button>
            </form>
          </div>
          <div className="grid gap-1">
            {collections.map((collection) => (
              <div key={collection.id} className="group relative">
                <SidebarItem
                  href={`/library?view=collection&collection=${collection.id}`}
                  active={activeView === 'collection' && activeCollectionId === collection.id}
                  icon={<Folder aria-hidden className="h-4 w-4" />}
                  label={collection.name}
                  count={collection.count}
                />
                {!collection.isDefault ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={labels.manageList}
                        disabled={busy || isRefreshing}
                        className="absolute top-1/2 right-2 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-md bg-white text-[#667085] shadow-[0_1px_4px_rgba(24,34,64,0.18)] hover:bg-[#eef0ff] hover:text-[#392ee5] group-hover:grid data-[state=open]:grid data-[state=open]:bg-[#eef0ff] data-[state=open]:text-[#392ee5]"
                      >
                        <MoreVertical aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => openRename(collection)}>
                        <Pencil aria-hidden className="h-3.5 w-3.5" />
                        {labels.renameList}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => setDeleteTarget(collection)}
                        className="text-[#d92d20] focus:bg-[#fff1f0] focus:text-[#b42318] data-[highlighted]:bg-[#fff1f0] data-[highlighted]:text-[#b42318]"
                      >
                        <Trash2 aria-hidden className="h-3.5 w-3.5" />
                        {labels.deleteList}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </aside>

      <section className="min-w-0 px-[39px] pt-[29px] pr-[82px] pb-6">
        <header className="mb-3 flex items-end justify-between gap-8">
          <div>
            <h1 className="mb-1 text-[27px] leading-tight font-extrabold tracking-normal">
              {title}
            </h1>
            <p className="text-sm text-[#576173]">{labels.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center gap-[14px]">
            <label className="flex h-9 w-[264px] items-center gap-2.5 rounded-[7px] border border-[#d9e0ea] bg-white px-[13px] text-[#98a2b3] focus-within:border-[#5b4df1]">
              <Search aria-hidden className="h-4 w-4" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#9aa4b4]"
              />
            </label>

            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger
                className={cn(filterTriggerClass, 'w-[128px]')}
                aria-label={labels.statusFilterAria}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{labels.statusFilterAll}</SelectItem>
                {STATUS_OPTIONS.map((status) => (
                  <SelectItem key={status} value={status}>
                    {labels.statuses[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <SearchableSelect
              ariaLabel={labels.tagFilterAria}
              value={tagFilter}
              onValueChange={setTagFilter}
              options={[{ value: ALL, label: labels.tagFilterAll }, ...tagOptions]}
              triggerLabel={tagTriggerLabel}
              searchPlaceholder={labels.tagSearchPlaceholder}
              noResultsLabel={labels.tagNoResults}
              triggerClassName={cn(filterTriggerClass, 'w-[150px] font-bold')}
            />

            <Select value={sort} onValueChange={(value) => setSort(value as LibrarySort)}>
              <SelectTrigger
                className={cn(filterTriggerClass, 'w-[150px]')}
                aria-label={labels.sortAria}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">{labels.sortRecent}</SelectItem>
                <SelectItem value="added">{labels.sortAdded}</SelectItem>
                <SelectItem value="score">{labels.sortScore}</SelectItem>
              </SelectContent>
            </Select>

            {hasFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex h-9 items-center gap-1.5 rounded-[7px] border border-[#d9e0ea] bg-white px-3 text-[13px] font-bold text-[#667085] hover:text-[#392ee5]"
              >
                <X aria-hidden className="h-4 w-4" />
                {labels.reset}
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <p
            role="alert"
            className="mb-3 rounded-lg border border-[#fecdca] bg-[#fff5f5] px-4 py-2 text-sm text-[#b42318]"
          >
            {error}
          </p>
        ) : null}

        <section className="mb-5 grid grid-cols-5 gap-4">
          {[
            [labels.metrics.total, stats.total, labels.metricsHelp.total, <BookMarked key="total" />],
            [labels.metrics.unread, stats.unread, labels.metricsHelp.unread, <BookOpen key="unread" />],
            [labels.metrics.reading, stats.reading, labels.metricsHelp.reading, <BookOpen key="reading" />],
            [labels.metrics.read, stats.read, labels.metricsHelp.read, <CheckCircle2 key="read" />],
            [labels.metrics.notes, stats.notes, labels.metricsHelp.notes, <MessageSquare key="notes" />],
          ].map(([label, value, help, icon]) => (
            <div
              key={String(label)}
              className="grid min-h-[92px] grid-cols-[38px_1fr] gap-3 rounded-[9px] border border-[#e0e6ef] bg-white px-[18px] py-4 shadow-[0_12px_32px_rgba(24,34,64,0.055)]"
            >
              <span className="grid h-[38px] w-[38px] place-items-center rounded-lg bg-[#eeedff] text-[#5848f5] [&_svg]:h-[18px] [&_svg]:w-[18px]">
                {icon}
              </span>
              <span>
                <strong className="block text-[22px] leading-none font-extrabold text-[#5848f5]">
                  {value}
                </strong>
                <b className="block text-[13px] text-[#344054]">{label}</b>
                <span className="mt-1 block text-xs text-[#8a94a6]">{help}</span>
              </span>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-3">
          {filteredPapers.length === 0 ? (
            <div className="grid min-h-[220px] place-items-center rounded-[10px] border border-dashed border-[#d9e0ea] bg-white p-8 text-center">
              <div>
                <CheckCircle2 aria-hidden className="mx-auto mb-3 h-8 w-8 text-[#98a2b3]" />
                <h2 className="text-lg font-extrabold text-[#121826]">{labels.emptyTitle}</h2>
                <p className="mt-1 text-sm text-[#667085]">{labels.emptyBody}</p>
              </div>
            </div>
          ) : (
            pagedPapers.map((paper) => (
              <article
                key={paper.id}
                className="relative grid min-h-[214px] grid-cols-[210px_minmax(0,1fr)] gap-[22px] rounded-[10px] border border-[#dfe5ef] bg-white py-5 pr-4 pl-[14px] shadow-[0_12px_32px_rgba(24,34,64,0.055)]"
              >
                <div className="flex flex-col items-stretch gap-2.5">
                  <Thumb paper={paper} />
                  <Select
                    value={paper.status}
                    onValueChange={(status) =>
                      updatePaper(paper.id, { status: status as UserPaperStatus })
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        'h-[27px] w-full justify-center rounded-full px-3 text-xs font-extrabold',
                        statusTone(paper.status),
                      )}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((status) => (
                        <SelectItem key={status} value={status}>
                          {labels.statuses[status]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="text-[11.5px] leading-relaxed text-[#667085]">
                    ▣&nbsp;&nbsp;{labels.lastViewed}：{paper.lastViewedAt ?? '-'}
                    <br />
                    ▣&nbsp;&nbsp;{labels.saveNote}： {paper.noteCount}
                  </div>
                </div>

                <div className="grid min-w-0 grid-rows-[auto_1fr]">
                  <h2 className="mb-1 pr-[176px] text-[16.5px] leading-snug font-extrabold text-[#101828]">
                    <Link href={`/papers/${paper.id}`} className="hover:underline">
                      {paper.title}
                    </Link>
                  </h2>
                  <div className="grid min-h-0 grid-cols-[minmax(300px,1fr)_292px] gap-[22px] pt-1">
                    <div className="min-w-0">
                      <p className="text-[12.5px] leading-relaxed text-[#667085]">
                        {paper.authors}
                      </p>
                      <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#667085]">
                        {paper.sourceLabel}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
                        {paper.publishedDate}
                      </p>
                      <p className="mt-2 line-clamp-4 text-[12.5px] leading-relaxed text-[#475467]">
                        {paper.summary}
                      </p>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {paper.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full bg-[#eeedff] px-2 py-1 text-[11.5px] font-extrabold text-[#5848f5]"
                          >
                            {tag}
                          </span>
                        ))}
                        {paper.tags.length > 5 ? (
                          <span className="rounded-full bg-[#eef1f6] px-2 py-1 text-[11.5px] font-extrabold text-[#667085]">
                            + {paper.tags.length - 5}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex min-h-0 flex-col justify-end">
                      <div className="h-[95%] min-h-[128px] overflow-hidden rounded-lg border border-[#d8ebe5] bg-[linear-gradient(135deg,#f9fffc,#edf8f5)] px-4 py-3">
                        <div className="mb-1 text-[13px] font-extrabold text-[#087d6c]">
                          ✧ {labels.aiSummary}
                        </div>
                        <p className="line-clamp-6 text-xs leading-relaxed text-[#536276]">
                          {paper.summary}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute top-[22px] right-8 flex h-[22px] items-center gap-4 text-[#536276]">
                  <Link href={`/papers/${paper.id}`} aria-label={labels.openPaper}>
                    <ExternalLink aria-hidden className="h-[18px] w-[18px]" />
                  </Link>
                  <button
                    type="button"
                    aria-label={labels.likedLabel}
                    disabled={busy || isRefreshing}
                    onClick={() => updatePaper(paper.id, { liked: !paper.liked })}
                    className={cn(paper.liked && 'text-[#5848f5]')}
                  >
                    <Heart
                      aria-hidden
                      className={cn('h-[18px] w-[18px]', paper.liked && 'fill-current')}
                    />
                  </button>
                  <span className="h-5 w-px bg-[#d9e0ea]" />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={labels.addToListHeading}
                        disabled={busy || isRefreshing}
                        className="hover:text-[#392ee5] data-[state=open]:text-[#392ee5]"
                      >
                        <Plus aria-hidden className="h-[18px] w-[18px]" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel>{labels.addToListHeading}</DropdownMenuLabel>
                      {collections.map((collection) => (
                        <DropdownMenuItem
                          key={collection.id}
                          onSelect={() => addPaperToList(paper.id, collection.id)}
                        >
                          <Folder aria-hidden className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{collection.name}</span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {activeView === 'collection' && activeCollectionId ? (
                    <button
                      type="button"
                      aria-label={labels.removeFromList}
                      disabled={busy || isRefreshing}
                      onClick={() => removeFromCurrentList(paper.id)}
                      className="hover:text-[#b42318]"
                    >
                      <Minus aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label={labels.removeFromLibrary}
                    disabled={busy || isRefreshing}
                    onClick={() => removeFromLibrary(paper.id)}
                    className="hover:text-[#b42318]"
                  >
                    <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                  </button>
                </div>
              </article>
            ))
          )}
        </section>

        {filteredPapers.length > 0 ? (
          <nav className="mt-5 flex items-center justify-between gap-4 text-[13px] text-[#667085]">
            <span>{labels.paginationRange(rangeFrom, rangeTo, filteredPapers.length)}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                disabled={currentPage <= 1}
                className="inline-flex h-9 items-center gap-1 rounded-[7px] border border-[#d9e0ea] bg-white px-3 font-bold text-[#344054] hover:text-[#392ee5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[#344054]"
              >
                <ChevronLeft aria-hidden className="h-4 w-4" />
                {labels.paginationPrev}
              </button>
              <span className="px-1 font-bold text-[#344054]">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                disabled={currentPage >= totalPages}
                className="inline-flex h-9 items-center gap-1 rounded-[7px] border border-[#d9e0ea] bg-white px-3 font-bold text-[#344054] hover:text-[#392ee5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[#344054]"
              >
                {labels.paginationNext}
                <ChevronRight aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </nav>
        ) : null}
      </section>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="max-w-sm gap-5 rounded-[12px] border-[#e0e6ef] bg-white">
          <DialogHeader>
            <DialogTitle className="text-[#101828]">{labels.renameList}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitRename} className="grid gap-4">
            <input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder={labels.newListPlaceholder}
              maxLength={80}
              className="h-10 w-full rounded-lg border border-[#d9e0ea] bg-white px-3 text-sm text-[#344054] outline-none focus:border-[#5b4df1]"
            />
            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setRenameTarget(null)}
                className="inline-flex h-9 items-center rounded-[7px] border border-[#d9e0ea] bg-white px-4 text-[13px] font-bold text-[#667085] hover:text-[#392ee5]"
              >
                {labels.cancel}
              </button>
              <button
                type="submit"
                disabled={busy || isRefreshing || !renameValue.trim()}
                className="inline-flex h-9 items-center rounded-[7px] bg-[#5848f5] px-4 text-[13px] font-bold text-white hover:bg-[#4a3de0] disabled:opacity-50"
              >
                {labels.renameList}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent className="max-w-md gap-5 rounded-[12px] border-[#e0e6ef] bg-white">
          <DialogHeader className="flex-row items-start gap-3 space-y-0 text-left">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#fff1f0] text-[#d92d20]">
              <AlertTriangle aria-hidden className="h-5 w-5" />
            </span>
            <div className="grid gap-1.5">
              <DialogTitle className="text-[#101828]">{labels.deleteList}</DialogTitle>
              <DialogDescription className="text-[#667085]">
                {deleteTarget ? labels.deleteListWarning.replace('{name}', deleteTarget.name) : ''}
              </DialogDescription>
            </div>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="inline-flex h-9 items-center rounded-[7px] border border-[#d9e0ea] bg-white px-4 text-[13px] font-bold text-[#667085] hover:text-[#392ee5]"
            >
              {labels.cancel}
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={busy || isRefreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-[7px] bg-[#d92d20] px-4 text-[13px] font-bold text-white hover:bg-[#b42318] disabled:opacity-50"
            >
              <Trash2 aria-hidden className="h-4 w-4" />
              {labels.deleteList}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

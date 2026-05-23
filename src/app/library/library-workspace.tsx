'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  BookMarked,
  BookOpen,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Folder,
  Grid2X2,
  Heart,
  History,
  List,
  MessageSquare,
  MoreVertical,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type { Source, UserPaperStatus } from '@prisma/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
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
  publishedDate: string;
  storedDate: string;
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
    addPapers: string;
    addToList: string;
    removeFromList: string;
    removeFromLibrary: string;
    openPaper: string;
    notePlaceholder: string;
    saveNote: string;
    emptyTitle: string;
    emptyBody: string;
    searchPlaceholder: string;
    statusLabel: string;
    likedLabel: string;
    lastViewed: string;
    metrics: {
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
  const [newListName, setNewListName] = useState('');

  const activeCollection = collections.find((collection) => collection.id === activeCollectionId);
  const title =
    activeView === 'liked'
      ? labels.liked
      : activeView === 'history'
        ? labels.history
        : activeView === 'collection' && activeCollection
          ? activeCollection.name
          : labels.title;

  const filteredPapers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return papers;
    return papers.filter((paper) =>
      [paper.title, paper.authors, paper.source, paper.summary, ...paper.tags]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [papers, query]);

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
      setError('Update failed. Please retry.');
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

  const saveNote = (event: FormEvent<HTMLFormElement>, paperId: string) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const note = String(form.get('note') ?? '');
    void runMutation(async () => {
      await jsonRequest(`/api/library/papers/${paperId}`, {
        method: 'PATCH',
        body: JSON.stringify({ note }),
      });
    });
  };

  const removePaper = (paperId: string) => {
    const collectionId = activeView === 'collection' ? activeCollectionId : null;
    void runMutation(async () => {
      await jsonRequest(`/api/library/papers/${paperId}`, {
        method: 'DELETE',
        body: JSON.stringify({ collectionId }),
      });
    });
  };

  return (
    <main className="grid min-h-[calc(100vh-73px)] min-w-[1180px] grid-cols-[282px_1fr] bg-[#f8faff] text-[#121826]">
      <aside className="border-r border-[#dde3ee] bg-white/60 px-[21px] py-[29px]">
        <section className="mb-[19px] border-b border-[#e4e9f2] pb-[22px]">
          <h2 className="mx-[14px] mb-[14px] text-sm font-extrabold text-[#334155]">我的圖書館</h2>
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
          <h2 className="mx-[14px] mb-[14px] text-sm font-extrabold text-[#334155]">閱讀狀態</h2>
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
          <div className="mx-[11px] mb-[13px] flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-[#334155]">{labels.collections}</h2>
            <form onSubmit={createList} className="flex items-center gap-1">
              <input
                value={newListName}
                onChange={(event) => setNewListName(event.target.value)}
                placeholder={labels.newListPlaceholder}
                className="h-7 w-[104px] rounded-md border border-[#d9e0ea] bg-white px-2 text-xs outline-none"
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
              <SidebarItem
                key={collection.id}
                href={`/library?view=collection&collection=${collection.id}`}
                active={activeView === 'collection' && activeCollectionId === collection.id}
                icon={<Folder aria-hidden className="h-4 w-4" />}
                label={collection.name}
                count={collection.count}
              />
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
          <div className="flex items-center gap-[14px]">
            <label className="flex h-9 w-[264px] items-center gap-2.5 rounded-[7px] border border-[#d9e0ea] bg-white px-[13px] text-[#98a2b3]">
              <Search aria-hidden className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={labels.searchPlaceholder}
                className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#9aa4b4]"
              />
            </label>
            <div className="flex h-9 items-center gap-2 rounded-[7px] border border-[#d9e0ea] bg-white px-[13px] text-[13px] font-bold text-[#344054]">
              狀態
            </div>
            <div className="flex h-9 items-center gap-2 rounded-[7px] border border-[#d9e0ea] bg-white px-[13px] text-[13px] font-bold text-[#344054]">
              標籤
            </div>
            <div className="flex h-9 items-center gap-2 rounded-[7px] border border-[#d9e0ea] bg-white px-[13px] text-[13px] font-bold text-[#344054]">
              排序：最近開啟
            </div>
            <div className="flex h-9 items-center gap-2 rounded-[7px] border border-[#d9e0ea] bg-white px-2.5 text-[#667085]">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-[#eeedff] text-[#5848f5]">
                <Grid2X2 aria-hidden className="h-4 w-4" />
              </span>
              <List aria-hidden className="h-4 w-4" />
            </div>
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
            [labels.metrics.total, stats.total, '所有收藏的論文總數', <BookMarked key="total" />],
            [labels.metrics.unread, stats.unread, '尚未開始閱讀', <BookOpen key="unread" />],
            [labels.metrics.reading, stats.reading, '正在閱讀的論文', <BookOpen key="reading" />],
            [labels.metrics.read, stats.read, '已完成閱讀', <CheckCircle2 key="read" />],
            [labels.metrics.notes, stats.notes, '所有論文筆記總數', <MessageSquare key="notes" />],
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
            filteredPapers.map((paper) => (
              <article
                key={paper.id}
                className="relative grid min-h-[214px] grid-cols-[210px_minmax(360px,1fr)_292px_150px] gap-[22px] rounded-[10px] border border-[#dfe5ef] bg-white py-5 pr-4 pl-[14px] shadow-[0_12px_32px_rgba(24,34,64,0.055)]"
              >
                <div className="flex flex-col items-center gap-2.5">
                  <Select
                    value={paper.status}
                    onValueChange={(status) =>
                      updatePaper(paper.id, { status: status as UserPaperStatus })
                    }
                  >
                    <SelectTrigger
                      className={cn(
                        'h-[27px] min-w-[96px] rounded-full px-3 text-xs font-extrabold',
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
                  <Thumb paper={paper} />
                </div>

                <div className="min-w-0">
                  <h2 className="mb-1 text-[16.5px] leading-snug font-extrabold text-[#101828]">
                    <Link href={`/papers/${paper.id}`} className="hover:underline">
                      {paper.title}
                    </Link>
                  </h2>
                  <p className="text-[12.5px] leading-relaxed text-[#667085]">{paper.authors}</p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#667085]">
                    {labels.sources[paper.source]}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;
                    {paper.publishedDate}
                  </p>
                  <p className="mt-2 line-clamp-3 text-[12.5px] leading-relaxed text-[#475467]">
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

                <div className="flex flex-col justify-center pt-[42px]">
                  <div className="absolute top-[22px] right-8 flex h-[22px] items-center gap-[18px] text-[#536276]">
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
                    <button
                      type="button"
                      aria-label={
                        activeView === 'collection'
                          ? labels.removeFromList
                          : labels.removeFromLibrary
                      }
                      disabled={busy || isRefreshing}
                      onClick={() => removePaper(paper.id)}
                    >
                      <Trash2 aria-hidden className="h-[18px] w-[18px]" />
                    </button>
                    <MoreVertical aria-hidden className="h-[18px] w-[18px]" />
                  </div>
                  <form
                    onSubmit={(event) => saveNote(event, paper.id)}
                    className="h-[118px] overflow-hidden rounded-lg border border-[#d8ebe5] bg-[linear-gradient(135deg,#f9fffc,#edf8f5)] px-4 py-3"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2 text-[13px] font-extrabold text-[#087d6c]">
                      <span>✧ AI 摘要</span>
                      <button
                        type="submit"
                        disabled={busy || isRefreshing}
                        className="text-[#5848f5]"
                      >
                        <Save aria-hidden className="h-4 w-4" />
                      </button>
                    </div>
                    <Textarea
                      name="note"
                      defaultValue={paper.note}
                      placeholder={labels.notePlaceholder}
                      className="min-h-[70px] resize-none border-0 bg-transparent p-0 text-xs leading-relaxed text-[#536276] shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                  </form>
                </div>

                <div className="flex flex-col items-center justify-center pt-[22px]">
                  <div
                    className="relative my-[11px] h-[78px] w-[78px] rounded-full"
                    style={{
                      background: `conic-gradient(#5848f5 ${paper.score ?? 0}%, #edf0f8 0)`,
                    }}
                  >
                    <span className="absolute inset-[5px] rounded-full bg-white" />
                    <strong className="absolute top-[26px] left-0 w-full text-center text-lg leading-none font-extrabold text-[#5848f5]">
                      {paper.score ?? 0}%
                    </strong>
                    <span className="absolute top-[49px] left-0 w-full text-center text-[10px] font-extrabold text-[#667085]">
                      評分
                    </span>
                  </div>
                  <div className="w-full text-[11.5px] leading-relaxed text-[#667085]">
                    ▣&nbsp;&nbsp;{labels.lastViewed}：{paper.lastViewedAt ?? '-'}
                    <br />
                    ▣&nbsp;&nbsp;{labels.saveNote}： {paper.noteCount}
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

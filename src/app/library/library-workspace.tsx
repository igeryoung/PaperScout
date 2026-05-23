'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  Folder,
  Heart,
  History,
  Inbox,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type { Source, UserPaperStatus } from '@prisma/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  lastViewedAt: string | null;
};

type AvailablePaperView = {
  id: string;
  title: string;
  authors: string;
  source: Source;
  publishedDate: string;
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
      liked: string;
      unread: string;
      notes: string;
      history: string;
    };
    statuses: Record<UserPaperStatus, string>;
    sources: Record<Source, string>;
  };
  activeView: 'all' | 'liked' | 'history' | 'collection';
  activeCollectionId: string | null;
  collections: CollectionView[];
  stats: {
    total: number;
    liked: number;
    unread: number;
    notes: number;
    history: number;
  };
  papers: PaperView[];
  availablePapers: AvailablePaperView[];
};

const STATUS_OPTIONS: UserPaperStatus[] = ['UNREAD', 'READING', 'READ', 'ARCHIVED'];

function metricTone(index: number) {
  return [
    'bg-[#eeedff] text-[#5848f5]',
    'bg-[#ffeef3] text-[#d92d6b]',
    'bg-[#e9f7f2] text-[#0f9f86]',
    'bg-[#fff7e6] text-[#b76e00]',
    'bg-[#eef6ff] text-[#2273c8]',
  ][index];
}

function SidebarLink({
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
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'grid min-h-9 grid-cols-[22px_1fr_auto] items-center gap-2 rounded-lg px-3 text-sm font-bold text-[#4d5a6c] hover:bg-[#f5f7fb]',
        active && 'bg-[#efedff] text-[#5848f5]',
      )}
    >
      {icon}
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined ? <span className="text-xs font-semibold">{count}</span> : null}
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
  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }
}

export function LibraryWorkspace({
  labels,
  activeView,
  activeCollectionId,
  collections,
  stats,
  papers,
  availablePapers,
}: LibraryWorkspaceProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [newListName, setNewListName] = useState('');

  const activeCollection = collections.find((collection) => collection.id === activeCollectionId);

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
    startRefresh(() => {
      router.refresh();
    });
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

  const renameList = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeCollection) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    if (!name) return;
    void runMutation(async () => {
      await jsonRequest(`/api/library/lists/${activeCollection.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      });
    });
  };

  const deleteList = () => {
    if (!activeCollection || activeCollection.isDefault) return;
    void runMutation(async () => {
      await jsonRequest(`/api/library/lists/${activeCollection.id}`, { method: 'DELETE' });
      router.push('/library');
    });
  };

  const addPaper = (paperId: string) => {
    void runMutation(async () => {
      await jsonRequest(`/api/library/papers/${paperId}`, {
        method: 'POST',
        body: JSON.stringify({ collectionId: activeCollectionId }),
      });
    });
  };

  const updatePaper = (paperId: string, patch: Partial<Pick<PaperView, 'liked' | 'status'>>) => {
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
    <main className="grid min-h-[calc(100vh-73px)] grid-cols-1 bg-[#f8faff] lg:grid-cols-[282px_1fr]">
      <aside className="border-r border-[#dde3ee] bg-white/60 px-5 py-7">
        <section className="mb-6 border-b border-[#e4e9f2] pb-5">
          <h2 className="mb-3 px-3 text-sm font-extrabold text-[#334155]">
            {labels.collections}
          </h2>
          <div className="grid gap-1">
            <SidebarLink
              href="/library"
              active={activeView === 'all'}
              icon={<Inbox aria-hidden className="h-4 w-4" />}
              label={labels.allPapers}
              count={stats.total}
            />
            <SidebarLink
              href="/library?view=liked"
              active={activeView === 'liked'}
              icon={<Heart aria-hidden className="h-4 w-4" />}
              label={labels.liked}
              count={stats.liked}
            />
            <SidebarLink
              href="/library?view=history"
              active={activeView === 'history'}
              icon={<History aria-hidden className="h-4 w-4" />}
              label={labels.history}
              count={stats.history}
            />
          </div>
        </section>

        <section className="mb-6 border-b border-[#e4e9f2] pb-5">
          <div className="mb-3 flex items-center justify-between px-3">
            <h2 className="text-sm font-extrabold text-[#334155]">{labels.newList}</h2>
          </div>
          <div className="grid gap-1">
            {collections.map((collection) => (
              <SidebarLink
                key={collection.id}
                href={`/library?view=collection&collection=${collection.id}`}
                active={activeView === 'collection' && activeCollectionId === collection.id}
                icon={<Folder aria-hidden className="h-4 w-4" />}
                label={collection.name}
                count={collection.count}
              />
            ))}
          </div>
          <form onSubmit={createList} className="mt-4 grid gap-2 px-3">
            <Input
              value={newListName}
              onChange={(event) => setNewListName(event.target.value)}
              placeholder={labels.newListPlaceholder}
              className="h-9 bg-white"
            />
            <Button type="submit" size="sm" disabled={busy || isRefreshing}>
              <Plus aria-hidden />
              {labels.createList}
            </Button>
          </form>
        </section>

        {activeCollection ? (
          <section className="rounded-lg border border-[#dfe5ef] bg-white p-4">
            <h2 className="mb-3 text-sm font-extrabold text-[#334155]">
              {labels.manageList}
            </h2>
            <form onSubmit={renameList} className="grid gap-2">
              <Input name="name" defaultValue={activeCollection.name} className="h-9" />
              <Button type="submit" size="sm" variant="outline" disabled={busy || isRefreshing}>
                {labels.renameList}
              </Button>
            </form>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 w-full text-[#b42318] hover:text-[#b42318]"
              disabled={busy || isRefreshing || activeCollection.isDefault}
              onClick={deleteList}
            >
              <Trash2 aria-hidden />
              {labels.deleteList}
            </Button>
          </section>
        ) : null}
      </aside>

      <section className="min-w-0 px-5 py-7 lg:px-10 xl:px-14">
        <header className="mb-5 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div>
            <h1 className="text-[28px] leading-tight font-extrabold tracking-normal text-[#121826]">
              {labels.title}
            </h1>
            <p className="mt-1 text-sm text-[#576173]">{labels.subtitle}</p>
          </div>
          <label className="flex h-10 w-full max-w-sm items-center gap-2 rounded-lg border border-[#d9e0ea] bg-white px-3 text-[#98a2b3]">
            <Search aria-hidden className="h-4 w-4" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={labels.searchPlaceholder}
              className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98a2b3]"
            />
          </label>
        </header>

        {error ? (
          <p role="alert" className="mb-4 rounded-lg border border-[#fecdca] bg-[#fff5f5] px-4 py-2 text-sm text-[#b42318]">
            {error}
          </p>
        ) : null}

        <section className="mb-5 grid gap-4 md:grid-cols-5">
          {[
            [labels.metrics.total, stats.total, <FileText key="total" aria-hidden />],
            [labels.metrics.liked, stats.liked, <Heart key="liked" aria-hidden />],
            [labels.metrics.unread, stats.unread, <BookOpen key="unread" aria-hidden />],
            [labels.metrics.notes, stats.notes, <Save key="notes" aria-hidden />],
            [labels.metrics.history, stats.history, <Clock3 key="history" aria-hidden />],
          ].map(([label, value, icon], index) => (
            <div
              key={String(label)}
              className="grid min-h-[88px] grid-cols-[38px_1fr] gap-3 rounded-[9px] border border-[#e0e6ef] bg-white p-4 shadow-[0_12px_32px_rgba(24,34,64,0.055)]"
            >
              <span className={cn('grid h-[38px] w-[38px] place-items-center rounded-lg', metricTone(index))}>
                {icon}
              </span>
              <span>
                <strong className="block text-xl leading-tight font-extrabold text-[#5848f5]">
                  {value}
                </strong>
                <span className="text-sm font-bold text-[#344054]">{label}</span>
              </span>
            </div>
          ))}
        </section>

        <section className="mb-5 rounded-[10px] border border-[#dfe5ef] bg-white p-4 shadow-[0_12px_32px_rgba(24,34,64,0.055)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-[#334155]">{labels.addPapers}</h2>
            {activeCollection ? (
              <Badge variant="secondary" className="max-w-[220px] truncate">
                {activeCollection.name}
              </Badge>
            ) : null}
          </div>
          {availablePapers.length === 0 ? (
            <p className="text-sm text-[#667085]">{labels.emptyBody}</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {availablePapers.map((paper) => (
                <article
                  key={paper.id}
                  className="grid gap-2 rounded-lg border border-[#e6ebf3] bg-[#fbfcff] p-3"
                >
                  <h3 className="line-clamp-2 text-sm font-bold text-[#121826]">
                    {paper.title}
                  </h3>
                  <p className="truncate text-xs text-[#667085]">
                    {paper.authors} · {labels.sources[paper.source]} · {paper.publishedDate}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || isRefreshing}
                    onClick={() => addPaper(paper.id)}
                  >
                    <Plus aria-hidden />
                    {labels.addToList}
                  </Button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-3">
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
                className="grid gap-4 rounded-[10px] border border-[#dfe5ef] bg-white p-4 shadow-[0_12px_32px_rgba(24,34,64,0.055)] xl:grid-cols-[minmax(0,1fr)_290px]"
              >
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{labels.sources[paper.source]}</Badge>
                    <Badge variant="outline">{paper.publishedDate}</Badge>
                    {paper.score !== null ? <Badge>{paper.score} / 100</Badge> : null}
                    {paper.lastViewedAt ? (
                      <Badge variant="outline">
                        {labels.lastViewed}: {paper.lastViewedAt}
                      </Badge>
                    ) : null}
                  </div>
                  <h2 className="text-lg leading-snug font-extrabold tracking-normal text-[#121826]">
                    <Link href={`/papers/${paper.id}`} className="hover:underline">
                      {paper.title}
                    </Link>
                  </h2>
                  <p className="mt-1 text-sm text-[#667085]">{paper.authors}</p>
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#344054]">
                    {paper.summary}
                  </p>
                  {paper.tags.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {paper.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="font-normal">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/papers/${paper.id}`}>{labels.openPaper}</Link>
                    </Button>
                    {paper.pdfUrl ? (
                      <Button asChild size="sm" variant="ghost">
                        <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
                          PDF
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant={paper.liked ? 'default' : 'outline'}
                      disabled={busy || isRefreshing}
                      onClick={() => updatePaper(paper.id, { liked: !paper.liked })}
                    >
                      <Heart aria-hidden className={paper.liked ? 'fill-current' : undefined} />
                      {labels.likedLabel}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy || isRefreshing}
                      onClick={() => removePaper(paper.id)}
                    >
                      <Trash2 aria-hidden />
                      {activeView === 'collection'
                        ? labels.removeFromList
                        : labels.removeFromLibrary}
                    </Button>
                  </div>
                </div>

                <form onSubmit={(event) => saveNote(event, paper.id)} className="grid content-start gap-3">
                  <label className="grid gap-1.5 text-xs font-bold text-[#475467]">
                    {labels.statusLabel}
                    <Select
                      value={paper.status}
                      onValueChange={(status) =>
                        updatePaper(paper.id, { status: status as UserPaperStatus })
                      }
                    >
                      <SelectTrigger className="h-9">
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
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-[#475467]">
                    {labels.saveNote}
                    <Textarea
                      name="note"
                      defaultValue={paper.note}
                      placeholder={labels.notePlaceholder}
                      className="min-h-[112px] resize-y text-sm"
                    />
                  </label>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={busy || isRefreshing}
                  >
                    <Save aria-hidden />
                    {labels.saveNote}
                  </Button>
                </form>
              </article>
            ))
          )}
        </section>
      </section>
    </main>
  );
}

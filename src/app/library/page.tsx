import 'server-only';

import Link from 'next/link';
import { BookmarkPlus } from 'lucide-react';
import type { UserPaperStatus } from '@prisma/client';
import { Button } from '@/components/ui/button';
import { getLocale, pickLocalized } from '@/lib/locale';
import { formatAuthors, formatDate } from '@/lib/format';
import { getMessages } from '@/i18n';
import { getCurrentSession } from '@/server/auth/current-user';
import { libraryRepo, type LibraryUserPaper, type LibraryView } from '@/server/repos/library';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { LibraryWorkspace, type LibraryWorkspaceProps } from './library-workspace';

export const dynamic = 'force-dynamic';

interface LibraryPageProps {
  searchParams: Promise<{ view?: string; collection?: string; status?: string }>;
}

function parseView(value: string | undefined): LibraryView {
  if (value === 'liked' || value === 'history' || value === 'collection') return value;
  return 'all';
}

function parseStatus(value: string | undefined): UserPaperStatus | undefined {
  if (value === 'UNREAD' || value === 'READING' || value === 'READ' || value === 'ARCHIVED') {
    return value;
  }
  return undefined;
}

function toPaperView(entry: LibraryUserPaper, locale: 'en' | 'zh-TW') {
  const evaluation = selectBestEvaluation(entry.paper.evaluations);
  const summary = pickLocalized(evaluation?.summary, locale);
  return {
    id: entry.paper.id,
    title: entry.paper.title,
    authors: formatAuthors(entry.paper.authors, 3),
    source: entry.paper.primarySource,
    publishedDate: formatDate(entry.paper.publishedDate),
    storedDate: formatDate(entry.createdAt),
    pdfUrl: entry.paper.pdfUrl,
    score: evaluation?.totalScore ?? null,
    summary:
      summary ??
      entry.paper.abstract ??
      'This paper is in your personal workspace. Add notes and status as you read.',
    tags: entry.paper.tags.slice(0, 5).map((tag) => tag.tag),
    hasFigure: Boolean(entry.paper.figure),
    liked: entry.liked,
    status: entry.status,
    note: entry.note ?? '',
    lastViewedAt: entry.lastViewedAt ? formatDate(entry.lastViewedAt) : null,
    noteCount: entry.note?.trim() ? 1 : 0,
  };
}

function SignInRequired() {
  return (
    <main className="mx-auto grid min-h-[520px] max-w-3xl place-items-center px-6 py-12">
      <section className="w-full rounded-[10px] border border-[#dfe5ef] bg-white p-8 text-center shadow-[0_18px_50px_rgba(31,42,68,0.08)]">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[14px] bg-[#eeedff] text-[#5848f5]">
          <BookmarkPlus aria-hidden className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-normal text-[#111827]">
          Sign in to use your paper collection
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#667085]">
          Lists, likes, notes, status, and reading history are stored per user.
        </p>
        <Button asChild className="mt-6">
          <Link href="/api/auth/google">Sign in with Google</Link>
        </Button>
      </section>
    </main>
  );
}

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const [params, locale, session] = await Promise.all([
    searchParams,
    getLocale(),
    getCurrentSession(),
  ]);
  if (!session) return <SignInRequired />;

  const messages = getMessages(locale);
  const view = parseView(params.view);
  const status = parseStatus(params.status);
  const collections = await libraryRepo.listCollections(session.user.id);
  const defaultCollection =
    collections.find((collection) => collection.isDefault) ?? collections[0];
  const selectedCollection =
    view === 'collection'
      ? (collections.find((collection) => collection.id === params.collection) ?? defaultCollection)
      : defaultCollection;

  const activeView = view === 'collection' && selectedCollection ? 'collection' : view;
  const addTargetCollectionId = selectedCollection?.id;

  const [stats, entries] = await Promise.all([
    libraryRepo.stats(session.user.id),
    libraryRepo.listEntries({
      userId: session.user.id,
      view: activeView,
      collectionId: activeView === 'collection' ? selectedCollection?.id : undefined,
      status,
    }),
  ]);

  const props: LibraryWorkspaceProps = {
    locale,
    labels: {
      title: messages.library.title,
      subtitle: messages.library.personalSubtitle,
      allPapers: messages.library.allPapers,
      liked: messages.library.liked,
      history: messages.library.history,
      collections: messages.library.collections,
      newList: messages.library.newList,
      newListPlaceholder: messages.library.newListPlaceholder,
      createList: messages.library.createList,
      manageList: messages.library.manageList,
      renameList: messages.library.renameList,
      deleteList: messages.library.deleteList,
      addPapers: messages.library.addPapers,
      addToList: messages.library.addToList,
      removeFromList: messages.library.removeFromList,
      removeFromLibrary: messages.library.removeFromLibrary,
      openPaper: messages.library.openPaper,
      notePlaceholder: messages.library.notePlaceholder,
      saveNote: messages.library.saveNote,
      emptyTitle: messages.library.emptyPersonalTitle,
      emptyBody: messages.library.emptyPersonalBody,
      searchPlaceholder: messages.library.searchPlaceholder,
      statusLabel: messages.library.statusLabel,
      likedLabel: messages.library.likedLabel,
      lastViewed: messages.library.lastViewed,
      metrics: {
        total: messages.library.metricTotal,
        unread: messages.library.metricUnread,
        reading: messages.library.metricReading,
        read: messages.library.metricRead,
        notes: messages.library.metricNotes,
      },
      statuses: messages.library.statuses,
      sources: messages.common.sources,
    },
    activeView,
    activeCollectionId: addTargetCollectionId ?? null,
    activeStatus: status ?? null,
    collections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      description: collection.description,
      isDefault: collection.isDefault,
      count: collection._count.items,
    })),
    stats,
    papers: entries.map((entry) => toPaperView(entry, locale)),
  };

  return <LibraryWorkspace {...props} />;
}

export type LibraryPaperStatus = UserPaperStatus;

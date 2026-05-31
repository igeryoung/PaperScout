import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { UserPaperStatus } from '@prisma/client';
import { papersRepo } from '@/server/repos/papers';
import { runsRepo } from '@/server/repos/runs';
import { libraryRepo } from '@/server/repos/library';
import { getCurrentSession } from '@/server/auth/current-user';
import { PaperDetail } from '@/components/paper-detail';
import { getLocale } from '@/lib/locale';
import { getMessages } from '@/i18n';

export const dynamic = 'force-dynamic';

interface PaperPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: PaperPageProps) {
  const { id } = await params;
  const [paper, latestRun, locale, session] = await Promise.all([
    papersRepo.findDetailById(id),
    runsRepo.latestCompleted(),
    getLocale(),
    getCurrentSession(),
  ]);
  if (!paper) notFound();

  let userPaper: { liked: boolean; status: UserPaperStatus; note: string } | null = null;
  if (session) {
    await libraryRepo.recordView({ userId: session.user.id, paperId: paper.id });
    const row = await libraryRepo.findUserPaperDetail({
      userId: session.user.id,
      paperId: paper.id,
    });
    if (row) {
      userPaper = { liked: row.liked, status: row.status, note: row.note ?? '' };
    }
  }
  const messages = getMessages(locale);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 sm:py-10">
      <div className="mb-6 text-sm">
        <Link
          href={latestRun ? `/runs/${latestRun.id}` : '/library'}
          className="inline-flex items-center gap-1 text-[#667085] transition-colors hover:text-[#5848f5]"
        >
          ← {latestRun ? messages.paperPage.backToRun : messages.paperPage.backToLibrary}
        </Link>
      </div>
      <PaperDetail
        paper={paper}
        locale={locale}
        messages={messages}
        userPaper={userPaper}
        signedIn={Boolean(session)}
      />
    </main>
  );
}

import 'server-only';

import { notFound } from 'next/navigation';
import type { UserPaperStatus } from '@prisma/client';
import { papersRepo } from '@/server/repos/papers';
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
  const [paper, locale, session] = await Promise.all([
    papersRepo.findDetailById(id),
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
    <main className="mx-auto max-w-6xl px-6 pt-4 pb-10">
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

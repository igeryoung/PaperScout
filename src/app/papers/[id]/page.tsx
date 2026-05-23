import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';
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
  if (session) {
    await libraryRepo.recordView({ userId: session.user.id, paperId: paper.id });
  }
  const messages = getMessages(locale);

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div className="text-muted-foreground text-sm">
        <Link
          href={latestRun ? `/runs/${latestRun.id}` : '/library'}
          className="hover:text-foreground"
        >
          ← {latestRun ? messages.paperPage.backToRun : messages.paperPage.backToLibrary}
        </Link>
      </div>
      <PaperDetail paper={paper} locale={locale} messages={messages} />
    </main>
  );
}

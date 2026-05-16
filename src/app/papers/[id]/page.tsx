import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { papersRepo } from '@/server/repos/papers';
import { runsRepo } from '@/server/repos/runs';
import { PaperDetail } from '@/components/paper-detail';

export const dynamic = 'force-dynamic';

interface PaperPageProps {
  params: Promise<{ id: string }>;
}

export default async function PaperPage({ params }: PaperPageProps) {
  const { id } = await params;
  const [paper, latestRun] = await Promise.all([
    papersRepo.findDetailById(id),
    runsRepo.latestCompleted(),
  ]);
  if (!paper) notFound();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div className="text-muted-foreground text-sm">
        <Link
          href={latestRun ? `/runs/${latestRun.id}` : '/library'}
          className="hover:text-foreground"
        >
          ← {latestRun ? 'Back to latest run' : 'Back to library'}
        </Link>
      </div>
      <PaperDetail paper={paper} />
    </main>
  );
}

import 'server-only';

import Link from 'next/link';
import { runsRepo } from '@/server/repos/runs';

export async function AppHeader() {
  const latest = await runsRepo.latestCompleted();

  return (
    <header className="border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-semibold tracking-tight">
          PaperScout
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/" className="hover:text-foreground text-muted-foreground">
            Home
          </Link>
          <Link href="/library" className="hover:text-foreground text-muted-foreground">
            Library
          </Link>
          {latest ? (
            <Link
              href={`/runs/${latest.id}`}
              className="hover:text-foreground text-muted-foreground"
            >
              Latest run
            </Link>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

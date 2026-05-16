import 'server-only';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { runsRepo } from '@/server/repos/runs';
import { runResultsRepo } from '@/server/repos/runResults';
import { trendsRepo } from '@/server/repos/trends';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { PaperCard } from '@/components/paper-card';
import { TrendSummary } from '@/components/trend-summary';
import { SourceMix } from '@/components/source-mix';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

interface RunPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ showAll?: string }>;
}

function isTruthyParam(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export default async function RunPage({ params, searchParams }: RunPageProps) {
  const { id } = await params;
  const { showAll } = await searchParams;
  const run = await runsRepo.findById(id);
  if (!run) notFound();
  const showAllResults = isTruthyParam(showAll);

  const header = (
    <header className="space-y-2">
      <p className="text-muted-foreground text-xs uppercase tracking-wide">
        Agent run · {formatDate(run.runDate)}
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">
        Paper trends for {formatDate(run.runDate)}
      </h1>
      <p className="text-muted-foreground text-sm">
        Status: {run.status}
        {run.completedAt ? (
          <>
            <span className="mx-2">·</span>Completed {formatDate(run.completedAt)}
          </>
        ) : null}
        {run.ingestSourceDir ? (
          <>
            <span className="mx-2">·</span>
            <code className="font-mono">{run.ingestSourceDir}</code>
          </>
        ) : null}
      </p>
    </header>
  );

  if (run.status === 'FAILED') {
    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        {header}
        <div className="rounded-md border border-dashed p-6">
          <p className="text-sm">This run failed before any papers were ranked.</p>
        </div>
      </main>
    );
  }

  if (run.status === 'RUNNING') {
    return (
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        {header}
        <div className="rounded-md border border-dashed p-6">
          <p className="text-sm">
            Collection/import in progress. Reload after the agent run completes.
          </p>
        </div>
      </main>
    );
  }

  // COMPLETED.
  const [summary, results] = await Promise.all([
    trendsRepo.getRunSummary(run.id),
    runResultsRepo.findByRunWithDetail(run.id, { recommendedOnly: !showAllResults }),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      {header}

      <section>
        <TrendSummary summary={summary} />
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide">Source mix</h2>
        <SourceMix sources={summary.sources} />
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">
            {showAllResults ? 'All ranked papers' : 'Recommended papers'}
            <span className="text-muted-foreground ml-2 text-sm font-normal tabular-nums">
              {results.length}
            </span>
          </h2>
          <Link
            href={showAllResults ? `/runs/${run.id}` : `/runs/${run.id}?showAll=1`}
            className="text-muted-foreground hover:text-foreground text-sm underline"
          >
            {showAllResults ? 'Show recommended only' : 'Show all results'}
          </Link>
        </div>
        {results.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
            {showAllResults
              ? 'This run produced no ranked papers.'
              : 'No papers in this run were marked RECOMMEND.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {results.map((r) => (
              <li key={r.id}>
                <PaperCard
                  rank={r.finalRank}
                  paper={r.paper}
                  evaluation={selectBestEvaluation(r.paper.evaluations)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

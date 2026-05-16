import 'server-only';

import Link from 'next/link';
import { runsRepo } from '@/server/repos/runs';
import { runResultsRepo } from '@/server/repos/runResults';
import { trendsRepo } from '@/server/repos/trends';
import { selectBestEvaluation } from '@/server/lib/select-evaluation';
import { PaperCard } from '@/components/paper-card';
import { TrendSummary } from '@/components/trend-summary';
import { TrendTags } from '@/components/trend-tags';
import { SourceMix } from '@/components/source-mix';
import { formatDate } from '@/lib/format';

export const dynamic = 'force-dynamic';

function EmptyState() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="rounded-lg border border-dashed p-10 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          No agent update ingested yet
        </h1>
        <p className="text-muted-foreground mt-3 text-sm">
          PaperScout is a read-only viewer. Run the collection and evaluation skills
          locally, then ingest the run directory.
        </p>
        <pre className="bg-muted mx-auto mt-6 max-w-md overflow-x-auto rounded-md p-4 text-left font-mono text-xs">
          {`# 1. Collect candidates\n#    (Claude Code → /collect-papers)\n# 2. Evaluate the top 15\n#    (Claude Code → /evaluate-papers)\n# 3. Ingest into the DB\nnpm run ingest data/runs/<YYYY-MM-DD-HHMM>`}
        </pre>
        <p className="text-muted-foreground mt-6 text-sm">
          You can still browse already-stored papers in the{' '}
          <Link href="/library" className="underline">
            library
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

export default async function HomePage() {
  const run = await runsRepo.latestCompleted();
  if (!run) return <EmptyState />;

  const [summary, recommended] = await Promise.all([
    trendsRepo.getRunSummary(run.id),
    runResultsRepo.findByRunWithDetail(run.id, { recommendedOnly: true }),
  ]);

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-6 py-10">
      <header className="space-y-2">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          Latest agent update · {formatDate(run.completedAt ?? run.createdAt)}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">PaperScout trends</h1>
        <p className="text-muted-foreground text-sm">
          Collected {summary.totalPapers} papers · {summary.recommendedCount}{' '}
          recommended
          {run.ingestSourceDir ? (
            <>
              {' '}
              · run dir <code className="font-mono">{run.ingestSourceDir}</code>
            </>
          ) : null}
        </p>
      </header>

      <section>
        <TrendSummary summary={summary} />
      </section>

      <div className="grid gap-8 lg:grid-cols-3">
        <section className="space-y-3 lg:col-span-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide">
            Top recommended
          </h2>
          {recommended.length === 0 ? (
            <p className="text-muted-foreground rounded-md border border-dashed p-6 text-sm">
              No papers in this run were marked RECOMMEND.{' '}
              <Link href={`/runs/${run.id}?showAll=1`} className="underline">
                See all results
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-3">
              {recommended.map((r) => (
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
          <div>
            <Link
              href={`/runs/${run.id}`}
              className="text-muted-foreground hover:text-foreground text-sm underline"
            >
              View full run →
            </Link>
          </div>
        </section>

        <aside className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide">
              Rising themes
            </h2>
            <TrendTags tags={summary.topTags} />
          </section>
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide">
              Source mix
            </h2>
            <SourceMix sources={summary.sources} />
          </section>
        </aside>
      </div>
    </main>
  );
}

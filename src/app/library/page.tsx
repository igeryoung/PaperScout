import 'server-only';

import { Badge } from '@/components/ui/badge';
import { papersRepo } from '@/server/repos/papers';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

function formatDate(d: Date | null) {
  return d ? dateFmt.format(d) : '—';
}

function formatAuthors(authors: unknown): string {
  if (!Array.isArray(authors)) return '—';
  return (authors as string[]).join(', ');
}

export default async function LibraryPage() {
  const papers = await papersRepo.listLibrary({ limit: 50 });

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">{papers.length} paper(s)</p>
      </header>

      {papers.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          No papers stored yet. Run <code className="font-mono">npm run db:seed</code> or
          ingest a run via <code className="font-mono">npm run ingest &lt;dir&gt;</code>.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">Title</th>
                <th className="px-4 py-2 font-medium">Authors</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2 font-medium">Published</th>
                <th className="px-4 py-2 font-medium">Stored</th>
              </tr>
            </thead>
            <tbody>
              {papers.map((p) => (
                <tr key={p.id} className="border-b last:border-b-0">
                  <td className="px-4 py-2 font-medium">{p.title}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatAuthors(p.authors)}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant="secondary">{p.primarySource}</Badge>
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDate(p.publishedDate)}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {formatDate(p.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

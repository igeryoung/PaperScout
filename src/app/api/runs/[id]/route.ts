import 'server-only';

import { runsRepo } from '@/server/repos/runs';
import { runResultsRepo } from '@/server/repos/runResults';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = await runsRepo.findById(id);
  if (!run) return Response.json({ error: 'not_found' }, { status: 404 });
  const results = await runResultsRepo.findByRun(id);
  return Response.json({
    id: run.id,
    status: run.status,
    candidateCount: results.length,
    createdAt: run.createdAt,
    completedAt: run.completedAt,
  });
}

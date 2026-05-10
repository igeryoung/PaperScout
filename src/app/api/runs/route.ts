import 'server-only';

import { after } from 'next/server';
import { runsRepo } from '@/server/repos/runs';
import { runCollectionInBackground, startRun } from '@/server/pipeline/runner';

export const dynamic = 'force-dynamic';
export const maxDuration = 600;

export async function POST() {
  const run = await startRun();
  after(() => runCollectionInBackground(run.id));
  return Response.json(run, { status: 202 });
}

export async function GET() {
  const runs = await runsRepo.listRecent(20);
  return Response.json({ runs });
}

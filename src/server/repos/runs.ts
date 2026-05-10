import { db } from '@/lib/db';
import type { RunStatus } from '@prisma/client';

export const runsRepo = {
  findByIngestSourceDir: (dir: string) =>
    db.dailyRun.findUnique({ where: { ingestSourceDir: dir } }),

  create: (input: {
    runDate: Date;
    ingestSourceDir: string | null;
    candidateCount: number;
  }) =>
    db.dailyRun.create({
      data: {
        runDate: input.runDate,
        ingestSourceDir: input.ingestSourceDir,
        candidateCount: input.candidateCount,
        status: 'RUNNING',
      },
    }),

  findById: (id: string) => db.dailyRun.findUnique({ where: { id } }),

  setStatus: (id: string, status: RunStatus, completed = false) =>
    db.dailyRun.update({
      where: { id },
      data: {
        status,
        completedAt: completed ? new Date() : undefined,
      },
    }),

  listRecent: (limit = 20) =>
    db.dailyRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),

  latestCompleted: () =>
    db.dailyRun.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
    }),
};

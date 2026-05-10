import { db } from '@/lib/db';
import type { MatchMethod } from '@prisma/client';

export const duplicatesRepo = {
  create: (input: {
    canonicalPaperId: string;
    duplicatePaperId: string;
    matchMethod: MatchMethod;
    confidence: number;
  }) => db.paperDuplicate.create({ data: input }),
};

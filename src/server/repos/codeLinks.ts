import 'server-only';
import { db } from '@/lib/db';

export const codeLinksRepo = {
  addAll: async (paperId: string, urls: string[]) => {
    if (urls.length === 0) return;
    const unique = Array.from(new Set(urls.filter((u) => /^https?:\/\//.test(u))));
    await db.paperCodeLink.createMany({
      data: unique.map((codeUrl) => ({ paperId, codeUrl })),
      skipDuplicates: true,
    });
  },
};

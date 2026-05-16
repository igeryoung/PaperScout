import { db } from '@/lib/db';

export const figuresRepo = {
  /**
   * Bytes lookup for the /api/papers/[id]/figure route. The list/detail
   * queries deliberately do NOT include `imageBytes` to keep payloads small;
   * the route fetches it on demand.
   */
  findBytesByPaperId: (paperId: string) =>
    db.paperFigure.findUnique({
      where: { paperId },
      select: { imageBytes: true, mimeType: true },
    }),

  upsert: (input: {
    paperId: string;
    imageBytes: Buffer;
    mimeType: string;
    caption: string | null;
    figureLabel: string | null;
    pageNumber: number | null;
    sourcePdfUrl: string | null;
  }) =>
    db.paperFigure.upsert({
      where: { paperId: input.paperId },
      create: {
        paperId: input.paperId,
        // Prisma's generated `Bytes` type is Uint8Array<ArrayBuffer>; Node's
        // Buffer is Buffer<ArrayBufferLike>. Runtime is happy with either.
        imageBytes: input.imageBytes as never,
        mimeType: input.mimeType,
        caption: input.caption,
        figureLabel: input.figureLabel,
        pageNumber: input.pageNumber,
        sourcePdfUrl: input.sourcePdfUrl,
      },
      update: {
        imageBytes: input.imageBytes as never,
        mimeType: input.mimeType,
        caption: input.caption,
        figureLabel: input.figureLabel,
        pageNumber: input.pageNumber,
        sourcePdfUrl: input.sourcePdfUrl,
        extractedAt: new Date(),
      },
    }),
};

import 'server-only';

import { figuresRepo } from '@/server/repos/figures';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const fig = await figuresRepo.findBytesByPaperId(id);
  if (!fig) return new Response(null, { status: 404 });

  // Prisma returns a Node Buffer (which extends Uint8Array); the Web Response
  // constructor accepts that directly.
  return new Response(fig.imageBytes, {
    headers: {
      'Content-Type': fig.mimeType,
      // Figure content is immutable per paper id. If we ever re-render the same
      // paper's figure, we'd need an ETag instead — but currently the figure is
      // only written once during ingest.
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}

import { promises as fs } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { figuresRepo } from '@/server/repos/figures';
import type { Evaluation } from '@/server/schema/evaluation';

const MAX_FIGURE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Reads the figure PNG referenced by an evaluation and upserts it into
 * paper_figures. Warns-but-does-not-throw on missing files, oversize files,
 * or read errors — figure rendering is best-effort.
 *
 * `figure.renderedPath` is treated as relative to `runDir` unless absolute.
 */
export async function ingestFigure(opts: {
  paperId: string;
  runDir: string;
  pdfUrl: string | null;
  figure: NonNullable<Evaluation['figure']>;
}): Promise<'ok' | 'missing' | 'oversize' | 'error'> {
  const { paperId, runDir, pdfUrl, figure } = opts;
  const absPath = isAbsolute(figure.renderedPath)
    ? figure.renderedPath
    : resolve(runDir, figure.renderedPath);

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    console.warn(`figure missing for paper ${paperId}: ${absPath}`);
    return 'missing';
  }

  if (stat.size > MAX_FIGURE_BYTES) {
    console.warn(
      `figure oversize for paper ${paperId}: ${stat.size} bytes (> ${MAX_FIGURE_BYTES})`,
    );
    return 'oversize';
  }

  let bytes: Buffer;
  try {
    bytes = await fs.readFile(absPath);
  } catch (err) {
    console.warn(`figure read failed for paper ${paperId}: ${(err as Error).message}`);
    return 'error';
  }

  await figuresRepo.upsert({
    paperId,
    imageBytes: bytes,
    mimeType: mimeFromPath(absPath),
    caption: figure.caption,
    figureLabel: figure.label,
    pageNumber: figure.pageNumber,
    sourcePdfUrl: pdfUrl,
  });

  return 'ok';
}

function mimeFromPath(p: string): string {
  const lower = p.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/png';
}

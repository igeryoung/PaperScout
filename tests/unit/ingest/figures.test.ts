// Unit tests for scripts/ingest/figures.ts — the per-paper figure upsert
// helper. Mocks the figures repo so the test does not require a database
// connection. The "ok" path is also covered by the integration tests in
// tests/integration/ingest.test.ts against a real DB.

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock factories are hoisted to the top of the file; module-level
// references inside the factory are not visible at hoist time. Use
// vi.hoisted() to create the mock fn alongside the factory.
const { upsertMock } = vi.hoisted(() => ({ upsertMock: vi.fn() }));

vi.mock('@/server/repos/figures', () => ({
  figuresRepo: { upsert: upsertMock },
}));

import { ingestFigure } from '../../../scripts/ingest/figures';

describe('ingestFigure', () => {
  beforeEach(() => {
    upsertMock.mockReset();
  });

  it('returns "missing" and skips upsert when the rendered PNG is absent', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'pcs-fig-missing-'));
    const out = await ingestFigure({
      paperId: '00000000-0000-0000-0000-000000000001',
      runDir,
      pdfUrl: null,
      figure: {
        label: 'Figure 1',
        pageNumber: 2,
        caption: { en: 'cap', 'zh-TW': 'cap' },
        renderedPath: 'figures/missing.png',
      },
    });
    expect(out).toBe('missing');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns "oversize" and skips upsert when the PNG is larger than 5 MB', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'pcs-fig-oversize-'));
    mkdirSync(join(runDir, 'figures'), { recursive: true });
    writeFileSync(
      join(runDir, 'figures', 'big.png'),
      Buffer.alloc(5 * 1024 * 1024 + 1, 0),
    );

    const out = await ingestFigure({
      paperId: '00000000-0000-0000-0000-000000000002',
      runDir,
      pdfUrl: 'https://example/pdf',
      figure: {
        label: 'Figure 1',
        pageNumber: 2,
        caption: { en: 'cap', 'zh-TW': 'cap' },
        renderedPath: 'figures/big.png',
      },
    });
    expect(out).toBe('oversize');
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it('returns "ok" and calls upsert with the file bytes when the PNG exists and is small', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'pcs-fig-ok-'));
    mkdirSync(join(runDir, 'figures'), { recursive: true });
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
    writeFileSync(join(runDir, 'figures', 'fig.png'), bytes);

    const out = await ingestFigure({
      paperId: '00000000-0000-0000-0000-000000000003',
      runDir,
      pdfUrl: 'https://example/pdf',
      figure: {
        label: 'Figure 1',
        pageNumber: 2,
        caption: { en: 'cap', 'zh-TW': 'cap' },
        renderedPath: 'figures/fig.png',
      },
    });
    expect(out).toBe('ok');
    expect(upsertMock).toHaveBeenCalledTimes(1);
    const arg = upsertMock.mock.calls[0][0];
    expect(arg.paperId).toBe('00000000-0000-0000-0000-000000000003');
    expect(arg.mimeType).toBe('image/png');
    expect(arg.figureLabel).toBe('Figure 1');
    expect(arg.pageNumber).toBe(2);
    expect(arg.caption).toEqual({ en: 'cap', 'zh-TW': 'cap' });
    expect(arg.sourcePdfUrl).toBe('https://example/pdf');
    expect(Buffer.isBuffer(arg.imageBytes)).toBe(true);
    expect(arg.imageBytes.equals(bytes)).toBe(true);
  });

  it('resolves an absolute renderedPath without joining to the run dir', async () => {
    const runDir = mkdtempSync(join(tmpdir(), 'pcs-fig-abs-'));
    const elsewhere = mkdtempSync(join(tmpdir(), 'pcs-fig-abs-other-'));
    const absPath = join(elsewhere, 'a.png');
    writeFileSync(absPath, Buffer.from([1, 2, 3, 4]));

    const out = await ingestFigure({
      paperId: '00000000-0000-0000-0000-000000000004',
      runDir,
      pdfUrl: null,
      figure: {
        label: 'Figure 1',
        pageNumber: 1,
        caption: { en: 'c', 'zh-TW': 'c' },
        renderedPath: absPath,
      },
    });
    expect(out).toBe('ok');
    expect(upsertMock).toHaveBeenCalled();
  });
});

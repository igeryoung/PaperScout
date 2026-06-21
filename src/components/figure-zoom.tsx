'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type FigureZoomProps = {
  src: string;
  alt: string;
  /** Localized hint shown on hover and used as the trigger's accessible label. */
  zoomHint: string;
};

export function FigureZoom({ src, alt, zoomHint }: FigureZoomProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={zoomHint}
        className="group relative block w-full cursor-zoom-in rounded-lg focus-visible:ring-2 focus-visible:ring-[#5b4df1] focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served from our own /api/papers/[id]/figure route. */}
        <img
          src={src}
          alt={alt}
          loading="eager"
          decoding="async"
          className="mx-auto max-h-[28rem] w-auto max-w-full rounded-lg border border-[#e5e9f3] bg-[#fbfcff] object-contain"
        />
        <span className="pointer-events-none absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
          <Maximize2 aria-hidden className="h-3 w-3" />
          {zoomHint}
        </span>
      </button>

      <DialogContent className="w-[min(96vw,1200px)] max-w-none border-0 bg-transparent p-0 text-white shadow-none">
        <DialogTitle className="sr-only">{alt}</DialogTitle>
        {/* eslint-disable-next-line @next/next/no-img-element -- served from our own /api/papers/[id]/figure route. */}
        <img
          src={src}
          alt={alt}
          decoding="async"
          className="mx-auto max-h-[90vh] w-auto max-w-full rounded-lg object-contain"
        />
      </DialogContent>
    </Dialog>
  );
}

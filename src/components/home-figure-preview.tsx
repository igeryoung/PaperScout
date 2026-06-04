'use client';

import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type HomeFigurePreviewProps = {
  src: string;
  alt: string;
  label: string;
  caption: string | null;
  zoomLabel: string;
  noCaptionLabel: string;
};

export function HomeFigurePreview({
  src,
  alt,
  label,
  caption,
  zoomLabel,
  noCaptionLabel,
}: HomeFigurePreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={zoomLabel}
        className="group relative flex h-44 min-h-44 w-full cursor-zoom-in items-center justify-center overflow-hidden rounded-lg border border-[#dce3ef] bg-[#fbfcff] transition hover:border-[#c9c8ff] focus:ring-2 focus:ring-[#5b4df1] focus:outline-none"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- served by the existing cache-controlled route. */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="max-h-full max-w-full object-contain"
        />
        <span className="absolute right-2 bottom-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100 group-focus:opacity-100">
          <ZoomIn aria-hidden className="h-4 w-4" />
        </span>
      </button>

      <DialogContent className="max-h-[90vh] w-[min(92vw,960px)] max-w-none gap-3 overflow-y-auto p-5">
        <DialogTitle className="pr-8 text-base text-[#111827]">{label}</DialogTitle>
        <div className="flex items-center justify-center rounded-lg bg-[#f4f6fb] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the existing cache-controlled route. */}
          <img
            src={src}
            alt={alt}
            decoding="async"
            className="max-h-[68vh] w-auto max-w-full object-contain"
          />
        </div>
        <DialogDescription className="text-sm leading-relaxed text-[#475467]">
          {caption ?? noCaptionLabel}
        </DialogDescription>
      </DialogContent>
    </Dialog>
  );
}

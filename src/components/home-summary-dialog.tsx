'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Lightbulb } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type HomeSummaryDialogProps = {
  /** Full detail page href, used by the footer link. */
  href: string;
  title: string;
  /** Pre-formatted "authors · venue · date" meta line. */
  meta: string;
  /** Localized AI summary (already falls back to a placeholder upstream). */
  summary: string;
  /** Original paper abstract, if stored. */
  abstract: string | null;
  triggerLabel: string;
  aiLabel: string;
  abstractLabel: string;
  emptyLabel: string;
  viewFullLabel: string;
};

export function HomeSummaryDialog({
  href,
  title,
  meta,
  summary,
  abstract,
  triggerLabel,
  aiLabel,
  abstractLabel,
  emptyLabel,
  viewFullLabel,
}: HomeSummaryDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-sm font-bold text-[#392ee5] transition-colors hover:text-[#5b4df1] focus-visible:ring-2 focus-visible:ring-[#5b4df1] focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {triggerLabel}
      </button>

      <DialogContent className="max-h-[85vh] w-[min(92vw,640px)] max-w-none gap-0 overflow-y-auto p-0">
        <div className="border-b border-[#edf1f7] p-5 pr-12">
          <DialogTitle className="text-lg leading-snug font-semibold text-[#111827]">
            {title}
          </DialogTitle>
          <p className="mt-2 text-[13px] text-[#667085]">{meta}</p>
        </div>

        <div className="space-y-5 p-5">
          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold tracking-wide text-[#0f9f86] uppercase">
              <Lightbulb aria-hidden className="h-4 w-4" />
              {aiLabel}
            </h3>
            <p className="max-w-prose text-sm leading-relaxed text-[#273142]">{summary}</p>
          </section>

          <section>
            <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold tracking-wide text-[#5b4df1] uppercase">
              <FileText aria-hidden className="h-4 w-4" />
              {abstractLabel}
            </h3>
            {abstract ? (
              <DialogDescription className="max-w-prose text-sm leading-relaxed whitespace-pre-line text-[#475467]">
                {abstract}
              </DialogDescription>
            ) : (
              <DialogDescription className="text-sm text-[#98a2b3] italic">
                {emptyLabel}
              </DialogDescription>
            )}
          </section>
        </div>

        <div className="flex justify-end border-t border-[#edf1f7] p-4">
          <Link
            href={href}
            className="text-[13px] font-bold text-[#392ee5] transition-colors hover:text-[#5b4df1]"
          >
            {viewFullLabel}
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

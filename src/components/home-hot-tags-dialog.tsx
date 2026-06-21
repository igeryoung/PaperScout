'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

type HotTag = { tag: string; count: number };

type HomeHotTagsDialogProps = {
  /** Every collected tag with its paper count, shown inside the dialog. */
  tags: HotTag[];
  triggerLabel: string;
  title: string;
  searchPlaceholder: string;
  noMatchLabel: string;
  emptyLabel: string;
};

export function HomeHotTagsDialog({
  tags,
  triggerLabel,
  title,
  searchPlaceholder,
  noMatchLabel,
  emptyLabel,
}: HomeHotTagsDialogProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((tag) => tag.tag.toLowerCase().includes(q));
  }, [tags, query]);

  // Reset the search box whenever the dialog is reopened.
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery('');
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer rounded-sm text-xs font-bold text-[#5b4df1] transition-colors hover:text-[#392ee5] focus-visible:ring-2 focus-visible:ring-[#5b4df1] focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {triggerLabel}
      </button>

      <DialogContent className="max-h-[85vh] w-[min(92vw,560px)] max-w-none gap-0 overflow-hidden p-0">
        <div className="border-b border-[#edf1f7] p-5 pr-12">
          <DialogTitle className="text-lg leading-snug font-semibold text-[#111827]">
            {title}
          </DialogTitle>
        </div>

        {tags.length > 0 && (
          <div className="border-b border-[#edf1f7] px-5 py-3">
            <div className="flex items-center gap-2 rounded-lg border border-[#e0e4ee] bg-[#f7f8fc] px-3 focus-within:border-[#5b4df1] focus-within:bg-white">
              <Search aria-hidden className="h-4 w-4 shrink-0 text-[#98a2b3]" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="min-h-[36px] min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98a2b3]"
              />
            </div>
          </div>
        )}

        <div className="max-h-[65vh] overflow-y-auto p-5">
          {tags.length === 0 ? (
            <p className="text-sm text-[#667085]">{emptyLabel}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-[#667085]">{noMatchLabel}</p>
          ) : (
            <div className="flex flex-wrap gap-2.5">
              {filtered.map((tag) => (
                <Link
                  key={tag.tag}
                  href={`/papers?tag=${encodeURIComponent(tag.tag)}`}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-[30px] items-center gap-1.5 rounded-full bg-[#eef0ff] px-3.5 text-[13px] font-bold text-[#2734b7] transition-colors hover:bg-[#e2e5ff]"
                >
                  {tag.tag}
                  <b className="text-xs text-[#6570e8]">{tag.count}</b>
                </Link>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

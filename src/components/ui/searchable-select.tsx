'use client';

import * as React from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';

import { cn } from '@/lib/utils';

export type SearchableSelectOption = {
  value: string;
  label: string;
};

export type SearchableSelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SearchableSelectOption[];
  /** Visible text on the closed trigger. */
  triggerLabel: string;
  searchPlaceholder: string;
  noResultsLabel: string;
  ariaLabel?: string;
  triggerClassName?: string;
};

export function SearchableSelect({
  value,
  onValueChange,
  options,
  triggerLabel,
  searchPlaceholder,
  noResultsLabel,
  ariaLabel,
  triggerClassName,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.label.toLowerCase().includes(q));
  }, [options, query]);

  // Close when clicking/tapping outside the component.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  // Reset search + focus the input each time the panel opens.
  React.useEffect(() => {
    if (!open) return;
    setQuery('');
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Keep the highlighted row valid and in view as the filtered list changes.
  React.useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const commit = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = filtered[activeIndex];
        if (option) commit(option.value);
        break;
      }
      case 'Escape':
        event.preventDefault();
        setOpen(false);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex h-9 w-[170px] items-center justify-between gap-2 rounded-lg border border-[#d7deea] bg-white px-3 text-sm font-semibold text-[#344054] outline-none focus-visible:border-[#5b4df1]',
          triggerClassName,
        )}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown
          aria-hidden
          className={cn('h-4 w-4 shrink-0 opacity-50 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-[240px] overflow-hidden rounded-lg border border-[#d7deea] bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-[#eef0f4] px-3">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-[#98a2b3]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-9 min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#9aa4b4]"
            />
          </div>

          <div ref={listRef} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[#98a2b3]">{noResultsLabel}</p>
            ) : (
              filtered.map((option, index) => {
                const selected = option.value === value;
                const active = index === activeIndex;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-active={active}
                    onClick={() => commit(option.value)}
                    onMouseMove={() => setActiveIndex(index)}
                    className={cn(
                      'relative flex w-full cursor-pointer items-center rounded-md py-1.5 pr-2 pl-8 text-left text-sm text-[#344054]',
                      active && 'bg-[#eef0ff] text-[#392ee5]',
                      selected && 'font-semibold',
                    )}
                  >
                    {selected ? (
                      <Check aria-hidden className="absolute left-2 h-4 w-4" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

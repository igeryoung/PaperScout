'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { FormEvent } from 'react';
import { Search, X } from 'lucide-react';
import type { ConferenceFacet, PaperSort, TagFacet } from '@/server/repos/papers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const ALL = '__all__';

export type PapersToolbarLabels = {
  searchPlaceholder: string;
  searchAria: string;
  searchSubmit: string;
  conferenceAll: string;
  conferenceAria: string;
  tagAll: string;
  tagAria: string;
  sortAria: string;
  sortNewest: string;
  sortOldest: string;
  sortScore: string;
  reset: string;
};

export type PapersToolbarProps = {
  query: string;
  venue?: string;
  tag?: string;
  sort: PaperSort;
  conferences: ConferenceFacet[];
  tags: TagFacet[];
  labels: PapersToolbarLabels;
};

const triggerClass =
  'h-9 min-w-[150px] rounded-lg border-[#d7deea] bg-white px-3 text-sm font-semibold text-[#344054]';

export function PapersToolbar({
  query: initialQuery,
  venue,
  tag,
  sort,
  conferences,
  tags,
  labels,
}: PapersToolbarProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(initialQuery);

  const hasFilters = Boolean(initialQuery || venue || tag) || sort !== 'newest';

  const navigate = (overrides: {
    q?: string;
    venue?: string;
    tag?: string;
    sort?: PaperSort;
  }) => {
    const nextQ = (overrides.q ?? query).trim();
    const nextVenue = overrides.venue ?? venue;
    const nextTag = overrides.tag ?? tag;
    const nextSort = overrides.sort ?? sort;

    const params = new URLSearchParams();
    if (nextQ) params.set('q', nextQ);
    if (nextVenue) params.set('venue', nextVenue);
    if (nextTag) params.set('tag', nextTag);
    if (nextSort && nextSort !== 'newest') params.set('sort', nextSort);
    // page intentionally omitted — any filter change resets to page 1.

    const qs = params.toString();
    startTransition(() => router.push(qs ? `/papers?${qs}` : '/papers'));
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate({ q: query });
  };

  const onReset = () => {
    setQuery('');
    startTransition(() => router.push('/papers'));
  };

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={isPending}>
      <form onSubmit={onSubmit} className="flex min-w-[240px] flex-1 items-center">
        <label className="flex h-9 w-full items-center gap-2.5 rounded-lg border border-[#d7deea] bg-white px-3 text-[#98a2b3] focus-within:border-[#5b4df1]">
          <Search aria-hidden className="h-4 w-4 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={labels.searchAria}
            placeholder={labels.searchPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#9aa4b4]"
          />
          <button type="submit" className="sr-only">
            {labels.searchSubmit}
          </button>
        </label>
      </form>

      <Select
        value={venue ?? ALL}
        onValueChange={(value) => navigate({ venue: value === ALL ? '' : value })}
      >
        <SelectTrigger className={triggerClass} aria-label={labels.conferenceAria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{labels.conferenceAll}</SelectItem>
          {conferences.map((conference) => (
            <SelectItem key={conference.value} value={conference.value}>
              {conference.value} · {conference.count}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={tag ?? ALL}
        onValueChange={(value) => navigate({ tag: value === ALL ? '' : value })}
      >
        <SelectTrigger className={triggerClass} aria-label={labels.tagAria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{labels.tagAll}</SelectItem>
          {tags.map((item) => (
            <SelectItem key={item.tag} value={item.tag}>
              {item.tag} · {item.count}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sort} onValueChange={(value) => navigate({ sort: value as PaperSort })}>
        <SelectTrigger className={`${triggerClass} min-w-[130px]`} aria-label={labels.sortAria}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="newest">{labels.sortNewest}</SelectItem>
          <SelectItem value="oldest">{labels.sortOldest}</SelectItem>
          <SelectItem value="score">{labels.sortScore}</SelectItem>
        </SelectContent>
      </Select>

      {hasFilters ? (
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#d7deea] bg-white px-3 text-sm font-semibold text-[#667085] hover:text-[#392ee5]"
        >
          <X aria-hidden className="h-4 w-4" />
          {labels.reset}
        </button>
      ) : null}
    </div>
  );
}

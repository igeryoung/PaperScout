'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type FeedControlsLabels = {
  controlsAria: string;
  domainAria: string;
  domainAll: string;
  timeAria: string;
  timeAll: string;
  timeWeek: string;
  timeMonth: string;
  timeYear: string;
};

const SELECT_CLASS =
  'min-h-9 rounded-lg border border-[#d7deea] bg-white px-3 text-sm text-[#344054] max-sm:flex-1';

export function FeedControls({
  domain,
  time,
  domainOptions,
  labels,
}: {
  domain: string;
  time: string;
  domainOptions: string[];
  labels: FeedControlsLabels;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string, isDefault: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (isDefault) params.delete(key);
    else params.set(key, value);
    // Filter changes always reset to the first page.
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <div
      className="flex items-center gap-3 pb-2.5 max-sm:flex-wrap"
      aria-label={labels.controlsAria}
    >
      <select
        aria-label={labels.domainAria}
        className={SELECT_CLASS}
        value={domain}
        onChange={(e) => update('domain', e.target.value, e.target.value === '')}
      >
        <option value="">{labels.domainAll}</option>
        {domainOptions.map((tag) => (
          <option key={tag} value={tag}>
            {tag}
          </option>
        ))}
      </select>

      <select
        aria-label={labels.timeAria}
        className={SELECT_CLASS}
        value={time}
        onChange={(e) => update('time', e.target.value, e.target.value === 'all')}
      >
        <option value="all">{labels.timeAll}</option>
        <option value="week">{labels.timeWeek}</option>
        <option value="month">{labels.timeMonth}</option>
        <option value="year">{labels.timeYear}</option>
      </select>
    </div>
  );
}

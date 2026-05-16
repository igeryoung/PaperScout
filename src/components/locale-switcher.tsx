'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Locale } from '@/lib/locale';

interface LocaleSwitcherProps {
  current: Locale;
  ariaLabel: string;
  optionEn: string;
  optionZhTw: string;
}

export function LocaleSwitcher({
  current,
  ariaLabel,
  optionEn,
  optionZhTw,
}: LocaleSwitcherProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function handleChange(value: string) {
    startTransition(async () => {
      await fetch('/api/locale', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ locale: value }),
      });
      router.refresh();
    });
  }

  return (
    <select
      aria-label={ariaLabel}
      value={current}
      disabled={pending}
      onChange={(e) => handleChange(e.target.value)}
      className="min-h-9 cursor-pointer rounded-lg border border-[#d7deea] bg-white px-2 text-sm text-[#344054] hover:text-[#392ee5] disabled:opacity-60"
    >
      <option value="en">{optionEn}</option>
      <option value="zh-TW">{optionZhTw}</option>
    </select>
  );
}

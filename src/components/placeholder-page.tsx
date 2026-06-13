import 'server-only';

import Link from 'next/link';
import type { Locale } from '@/lib/locale';
import { getMessages } from '@/i18n';

type PlaceholderKey = 'about' | 'faq' | 'howItWorks' | 'privacy' | 'terms';

export function PlaceholderPage({ locale, page }: { locale: Locale; page: PlaceholderKey }) {
  const t = getMessages(locale).placeholder;

  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center px-6 py-20 text-center">
      <div className="w-full rounded-2xl border border-[#e5e9f3] bg-white p-10">
        <span className="inline-flex items-center rounded-full bg-[#eef0fb] px-3 py-1 text-xs font-semibold text-[#392ee5]">
          {t.badge}
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight text-[#111827]">
          {t.titles[page]}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[#667085]">{t.body}</p>
        <Link
          href="/"
          className="mt-7 inline-flex items-center justify-center rounded-[10px] border border-[#d8dfeb] bg-white px-4 py-2 text-sm font-bold text-[#111827] transition-colors hover:border-[#392ee5] hover:text-[#392ee5]"
        >
          {t.backHome}
        </Link>
      </div>
    </main>
  );
}

import 'server-only';

import Link from 'next/link';
import type { Locale } from '@/lib/locale';
import { getMessages } from '@/i18n';

const CONTACT_EMAIL = 'asd7415953@gmail.com';

// Curated topic chips. Each deep-links into the all-papers search so the pill
// always lands on a valid, populated results page rather than a dead route.
const TOPICS: ReadonlyArray<{ label: string; q: string }> = [
  { label: 'multimodal', q: 'multimodal' },
  { label: 'llm agents', q: 'agent' },
  { label: 'benchmark', q: 'benchmark' },
  { label: 'diffusion', q: 'diffusion' },
  { label: 'reasoning', q: 'reasoning' },
  { label: 'reinforcement learning', q: 'reinforcement' },
];

export function AppFooter({ locale }: { locale: Locale }) {
  const messages = getMessages(locale);
  const t = messages.footer;
  const brand = messages.header.brand;

  return (
    <footer
      aria-label={t.ariaLabel}
      className="mt-12 border-t border-[#e5e9f3] bg-white"
    >
      <div className="mx-auto max-w-[1760px] px-4 pt-12 pb-5 sm:px-6 lg:px-12">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-[1.6fr_1fr_1.1fr_1.3fr] lg:gap-x-0">
          {/* Brand */}
          <div className="col-span-2 max-w-sm space-y-4 lg:col-span-1">
            <Link
              href="/"
              className="inline-flex items-center gap-3 text-[20px] font-extrabold tracking-normal text-[#392ee5]"
            >
              <span
                aria-hidden
                className="relative grid h-[32px] w-[32px] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_24%_18%,#ffffff_0_8%,transparent_9%),linear-gradient(145deg,#7c65ff,#4338ca)] shadow-[0_12px_25px_rgba(91,77,241,0.28)] before:h-[13px] before:w-[17px] before:-rotate-[8deg] before:bg-white before:[clip-path:polygon(0_26%,100%_0,74%_100%,45%_62%,16%_84%)]"
              />
              <span>{brand}</span>
            </Link>
            <p className="text-sm leading-relaxed text-[#667085]">{t.tagline}</p>
          </div>

          {/* Resources */}
          <nav
            aria-label={t.resourcesHeading}
            className="space-y-4 lg:ml-10 lg:border-l lg:border-[#e5e9f3] lg:pl-10"
          >
            <h2 className="text-sm font-bold text-[#111827]">{t.resourcesHeading}</h2>
            <ul className="space-y-3 text-sm text-[#667085]">
              <li>
                <Link href="/about" className="transition-colors hover:text-[#392ee5]">
                  {t.navAbout}
                </Link>
              </li>
              <li>
                <Link href="/faq" className="transition-colors hover:text-[#392ee5]">
                  {t.navFaq}
                </Link>
              </li>
              <li>
                <Link href="/how-it-works" className="transition-colors hover:text-[#392ee5]">
                  {t.navHowItWorks}
                </Link>
              </li>
            </ul>
          </nav>

          {/* Contact */}
          <div className="space-y-4 lg:ml-10 lg:border-l lg:border-[#e5e9f3] lg:pl-10">
            <h2 className="text-sm font-bold text-[#111827]">{t.contactHeading}</h2>
            <div className="space-y-1.5 text-sm text-[#667085]">
              <p>{t.emailHint}</p>
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                title={t.email}
                className="font-medium break-all text-[#392ee5] underline-offset-4 transition-colors hover:text-[#291fb0] hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </div>
          </div>

          {/* Hot topics */}
          <div className="col-span-2 space-y-4 lg:col-span-1 lg:ml-10 lg:border-l lg:border-[#e5e9f3] lg:pl-10">
            <h2 className="text-sm font-bold text-[#111827]">{t.topicsHeading}</h2>
            <ul className="flex flex-wrap gap-2">
              {TOPICS.map((topic) => (
                <li key={topic.label}>
                  <Link
                    href={`/papers?q=${encodeURIComponent(topic.q)}`}
                    className="inline-flex items-center rounded-full bg-[#eef0fb] px-3 py-1 text-xs font-semibold text-[#392ee5] transition-colors hover:bg-[#e1e4f8]"
                  >
                    {topic.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-2 border-t border-[#eef1f7] pt-4 text-xs text-[#98a2b3] sm:flex-row sm:items-center sm:justify-between">
          <p>{t.copyright}</p>
          <div className="flex items-center gap-3">
            <Link href="/privacy" className="transition-colors hover:text-[#392ee5]">
              {t.privacy}
            </Link>
            <span aria-hidden className="text-[#d3d8e3]">
              ·
            </span>
            <Link href="/terms" className="transition-colors hover:text-[#392ee5]">
              {t.terms}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

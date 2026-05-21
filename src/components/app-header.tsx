import 'server-only';

import Link from 'next/link';
import { Bell, Search } from 'lucide-react';
import { runsRepo } from '@/server/repos/runs';
import type { Locale } from '@/lib/locale';
import { getMessages } from '@/i18n';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { UserMenu } from '@/components/user-menu';
import { getCurrentSession } from '@/server/auth/current-user';

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className={className}>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.654 32.657 29.223 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

export function AppHeaderPlaceholder({ locale }: { locale: Locale }) {
  const t = getMessages(locale).header;

  return (
    <header className="sticky top-0 z-30 border-b border-[#e5e9f3] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1760px] grid-cols-1 items-center gap-4 px-4 py-3 sm:px-6 lg:grid-cols-[220px_minmax(280px,1fr)_auto] lg:px-12">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-3 text-[22px] font-extrabold tracking-normal text-[#392ee5] lg:justify-start"
        >
          <span
            aria-hidden
            className="relative grid h-[34px] w-[34px] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_24%_18%,#ffffff_0_8%,transparent_9%),linear-gradient(145deg,#7c65ff,#4338ca)] shadow-[0_12px_25px_rgba(91,77,241,0.28)] before:h-[14px] before:w-[18px] before:-rotate-[8deg] before:bg-white before:[clip-path:polygon(0_26%,100%_0,74%_100%,45%_62%,16%_84%)]"
          />
          <span>{t.brand}</span>
        </Link>

        <div className="mx-auto flex min-h-11 w-full max-w-[620px] items-center gap-3 rounded-[10px] border border-[#d8dfeb] bg-white px-4 text-[#98a2b3]">
          <Search aria-hidden className="h-5 w-5 shrink-0" />
          <span className="h-3 flex-1 animate-pulse rounded-full bg-[#edf1f7]" />
        </div>

        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold whitespace-nowrap text-[#111827] lg:justify-end xl:gap-x-7"
          aria-label={t.mainNavAria}
        >
          <Link href="/" className="hover:text-[#392ee5]">
            {t.navHot}
          </Link>
          <Link href="/library" className="hover:text-[#392ee5]">
            {t.navLatest}
          </Link>
          <Link href="/library" className="hover:text-[#392ee5]">
            {t.navLibrary}
          </Link>
          <span aria-hidden className="hidden h-[22px] w-px bg-[#cfd6e3] sm:block" />
          <LocaleSwitcher
            current={locale}
            ariaLabel={t.localeSwitcherAria}
            optionEn={t.localeSwitcherOptionEn}
            optionZhTw={t.localeSwitcherOptionZhTw}
          />
          <span className="h-9 w-24 animate-pulse rounded-[10px] border border-[#d8dfeb] bg-[#f5f7fb]" />
        </nav>
      </div>
    </header>
  );
}

export async function AppHeader({ locale }: { locale: Locale }) {
  const [latest, session] = await Promise.all([
    runsRepo.latestCompletedForDisplay(),
    getCurrentSession(),
  ]);
  const t = getMessages(locale).header;
  const latestHref = latest ? `/runs/${latest.id}` : '/library';

  return (
    <header className="sticky top-0 z-30 border-b border-[#e5e9f3] bg-white/90 backdrop-blur-xl">
      <div className="mx-auto grid max-w-[1760px] grid-cols-1 items-center gap-4 px-4 py-3 sm:px-6 lg:grid-cols-[220px_minmax(280px,1fr)_auto] lg:px-12">
        <Link
          href="/"
          className="inline-flex items-center justify-center gap-3 text-[22px] font-extrabold tracking-normal text-[#392ee5] lg:justify-start"
        >
          <span
            aria-hidden
            className="relative grid h-[34px] w-[34px] place-items-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_24%_18%,#ffffff_0_8%,transparent_9%),linear-gradient(145deg,#7c65ff,#4338ca)] shadow-[0_12px_25px_rgba(91,77,241,0.28)] before:h-[14px] before:w-[18px] before:-rotate-[8deg] before:bg-white before:[clip-path:polygon(0_26%,100%_0,74%_100%,45%_62%,16%_84%)]"
          />
          <span>{t.brand}</span>
        </Link>

        <label className="mx-auto flex min-h-11 w-full max-w-[620px] items-center gap-3 rounded-[10px] border border-[#d8dfeb] bg-white px-4 text-[#475467] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          <Search aria-hidden className="h-5 w-5 shrink-0" />
          <input
            type="search"
            aria-label={t.searchAria}
            placeholder={t.searchPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98a2b3]"
          />
          <span className="hidden min-w-11 justify-center rounded-lg bg-[#f2f4f8] px-2 py-1 text-xs text-[#667085] sm:inline-flex">
            {t.keyboardHint}
          </span>
        </label>

        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold whitespace-nowrap text-[#111827] lg:justify-end xl:gap-x-7"
          aria-label={t.mainNavAria}
        >
          <Link href="/" className="hover:text-[#392ee5]">
            {t.navHot}
          </Link>
          <Link href={latestHref} className="hover:text-[#392ee5]">
            {t.navLatest}
          </Link>
          <Link href="/library" className="hover:text-[#392ee5]">
            {t.navLibrary}
          </Link>
          <span aria-hidden className="hidden h-[22px] w-px bg-[#cfd6e3] sm:block" />
          <span
            aria-disabled="true"
            className="cursor-not-allowed text-[#667085]"
            title={t.navUploadTitle}
          >
            {t.navUpload}
          </span>
          <span aria-hidden className="hidden h-[22px] w-px bg-[#cfd6e3] sm:block" />
          <LocaleSwitcher
            current={locale}
            ariaLabel={t.localeSwitcherAria}
            optionEn={t.localeSwitcherOptionEn}
            optionZhTw={t.localeSwitcherOptionZhTw}
          />
          <button
            type="button"
            disabled
            aria-label={t.notificationsAria}
            className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-[10px] text-[#111827] opacity-75"
          >
            <Bell aria-hidden className="h-5 w-5" />
          </button>
          {session ? (
            <UserMenu
              user={{
                name: session.user.name,
                email: session.user.email,
                avatarUrl: session.user.avatarUrl,
              }}
              labels={{
                avatarAria: t.avatarAria,
                signedInTitle: t.signedInAs(session.user.name ?? session.user.email),
                accountMenuAria: t.accountMenuAria,
                account: t.userMenu.account,
                viewHistory: t.userMenu.viewHistory,
                viewHistoryDisabledTitle: t.userMenu.viewHistoryDisabledTitle,
                collect: t.userMenu.collect,
                collectDisabledTitle: t.userMenu.collectDisabledTitle,
                signOut: t.userMenu.signOut,
                signOutFailed: t.userMenu.signOutFailed,
              }}
            />
          ) : (
            <Link
              href="/api/auth/google"
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[10px] border border-[#d8dfeb] bg-white px-3 text-sm font-bold text-[#111827] hover:border-[#392ee5] hover:text-[#392ee5]"
            >
              <GoogleIcon className="h-4 w-4 shrink-0" />
              {t.signInWithGoogle}
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

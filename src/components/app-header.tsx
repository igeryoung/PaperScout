import 'server-only';

import Link from 'next/link';
import { Bell, ChevronDown, Search } from 'lucide-react';
import { runsRepo } from '@/server/repos/runs';

export async function AppHeader() {
  const latest = await runsRepo.latestCompletedForDisplay();
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
          <span>PaperScout</span>
        </Link>

        <label className="mx-auto flex min-h-11 w-full max-w-[620px] items-center gap-3 rounded-[10px] border border-[#d8dfeb] bg-white px-4 text-[#475467] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
          <Search aria-hidden className="h-5 w-5 shrink-0" />
          <input
            type="search"
            aria-label="搜尋論文"
            placeholder="搜尋論文標題、作者、關鍵字或主題..."
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344054] outline-none placeholder:text-[#98a2b3]"
          />
          <span className="hidden min-w-11 justify-center rounded-lg bg-[#f2f4f8] px-2 py-1 text-xs text-[#667085] sm:inline-flex">
            ⌘ K
          </span>
        </label>

        <nav
          className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-bold whitespace-nowrap text-[#111827] lg:justify-end xl:gap-x-7"
          aria-label="主選單"
        >
          <Link href="/" className="hover:text-[#392ee5]">
            熱門
          </Link>
          <Link href={latestHref} className="hover:text-[#392ee5]">
            最新
          </Link>
          <Link href="/library" className="hover:text-[#392ee5]">
            我的收藏
          </Link>
          <span aria-hidden className="hidden h-[22px] w-px bg-[#cfd6e3] sm:block" />
          <span
            aria-disabled="true"
            className="cursor-not-allowed text-[#667085]"
            title="V1 目前由本機 skill 產生與匯入資料"
          >
            上傳論文
          </span>
          <span aria-hidden className="hidden h-[22px] w-px bg-[#cfd6e3] sm:block" />
          <button
            type="button"
            disabled
            aria-label="通知"
            className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-[10px] text-[#111827] opacity-75"
          >
            <Bell aria-hidden className="h-5 w-5" />
          </button>
          <span
            aria-label="使用者頭像"
            className="h-8 w-8 rounded-full bg-[radial-gradient(circle_at_50%_36%,#f7c7b5_0_22%,transparent_23%),radial-gradient(circle_at_50%_78%,#263238_0_31%,transparent_32%),linear-gradient(#dfe8ff,#f9f5ff)] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.08)]"
          />
          <button
            type="button"
            disabled
            aria-label="開啟帳號選單"
            className="grid h-9 w-9 cursor-not-allowed place-items-center rounded-[10px] text-[#111827] opacity-75"
          >
            <ChevronDown aria-hidden className="h-4 w-4" />
          </button>
        </nav>
      </div>
    </header>
  );
}

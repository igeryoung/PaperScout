import 'server-only';

import { redirect } from 'next/navigation';
import { getCurrentSession } from '@/server/auth/current-user';
import { usersRepo } from '@/server/repos/users';
import { getLocale } from '@/lib/locale';
import { getMessages } from '@/i18n';
import { AccountForm } from './account-form';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

function formatDate(d: Date | null) {
  return d ? dateFmt.format(d) : '—';
}

export default async function AccountPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect('/api/auth/google');
  }

  const [user, locale] = await Promise.all([
    usersRepo.findPublicById(session.user.id),
    getLocale(),
  ]);
  if (!user) {
    redirect('/api/auth/google');
  }

  const t = getMessages(locale).account;
  const headerT = getMessages(locale).header;
  const initialLocale =
    user.localePreference === 'en' || user.localePreference === 'zh-TW'
      ? user.localePreference
      : locale;

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-[#111827]">{t.title}</h1>

      <section className="mb-8 flex items-center gap-4 rounded-2xl border border-[#e5e9f3] bg-white p-5">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.avatarUrl}
            alt=""
            aria-hidden
            className="h-14 w-14 rounded-full object-cover shadow-[inset_0_0_0_1px_rgba(17,24,39,0.08)]"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span
            aria-hidden
            className="h-14 w-14 rounded-full bg-[radial-gradient(circle_at_50%_36%,#f7c7b5_0_22%,transparent_23%),radial-gradient(circle_at_50%_78%,#263238_0_31%,transparent_32%),linear-gradient(#dfe8ff,#f9f5ff)] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.08)]"
          />
        )}
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[#111827]">
            {user.name ?? user.email}
          </p>
          <p className="truncate text-sm text-[#667085]">{user.email}</p>
        </div>
      </section>

      <AccountForm
        initial={{ name: user.name ?? '', localePreference: initialLocale }}
        labels={{
          nameLabel: t.nameLabel,
          namePlaceholder: t.namePlaceholder,
          localeLabel: t.localeLabel,
          localeHelp: t.localeHelp,
          save: t.save,
          saving: t.saving,
          saveFailed: t.saveFailed,
          nameRequired: t.nameRequired,
          localeOptionEn: headerT.localeSwitcherOptionEn,
          localeOptionZhTw: headerT.localeSwitcherOptionZhTw,
        }}
      />

      <dl className="mt-8 grid grid-cols-1 gap-4 rounded-2xl border border-[#e5e9f3] bg-white p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[#667085]">{t.emailLabel}</dt>
          <dd className="mt-1 text-[#111827]">{user.email}</dd>
        </div>
        <div>
          <dt className="text-[#667085]">{t.lastLoginLabel}</dt>
          <dd className="mt-1 text-[#111827]">{formatDate(user.lastLoginAt)}</dd>
        </div>
        <div>
          <dt className="text-[#667085]">{t.memberSinceLabel}</dt>
          <dd className="mt-1 text-[#111827]">{formatDate(user.createdAt)}</dd>
        </div>
      </dl>
    </main>
  );
}

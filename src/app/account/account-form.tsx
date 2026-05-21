'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type LocalePref = 'en' | 'zh-TW';

export type AccountFormLabels = {
  nameLabel: string;
  namePlaceholder: string;
  localeLabel: string;
  localeHelp: string;
  save: string;
  saving: string;
  saveFailed: string;
  nameRequired: string;
  localeOptionEn: string;
  localeOptionZhTw: string;
};

export function AccountForm({
  initial,
  labels,
}: {
  initial: { name: string; localePreference: LocalePref };
  labels: AccountFormLabels;
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [locale, setLocale] = useState<LocalePref>(initial.localePreference);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  const dirty = name.trim() !== initial.name.trim() || locale !== initial.localePreference;
  const trimmed = name.trim();
  const canSubmit = dirty && trimmed.length > 0 && !submitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (trimmed.length === 0) {
      setError(labels.nameRequired);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: trimmed, localePreference: locale }),
      });
      if (!res.ok) {
        setError(labels.saveFailed);
        return;
      }
      setSavedAt(new Date());
      startTransition(() => router.refresh());
    } catch {
      setError(labels.saveFailed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-5 rounded-2xl border border-[#e5e9f3] bg-white p-5"
    >
      <div className="space-y-2">
        <label htmlFor="account-name" className="block text-sm font-medium text-[#111827]">
          {labels.nameLabel}
        </label>
        <input
          id="account-name"
          name="name"
          type="text"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder={labels.namePlaceholder}
          className="block w-full rounded-lg border border-[#d8dfeb] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#392ee5] focus:ring-2 focus:ring-[#392ee5]/20"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="account-locale" className="block text-sm font-medium text-[#111827]">
          {labels.localeLabel}
        </label>
        <select
          id="account-locale"
          name="localePreference"
          value={locale}
          onChange={(e) => setLocale(e.target.value as LocalePref)}
          className="block w-full rounded-lg border border-[#d8dfeb] bg-white px-3 py-2 text-sm text-[#111827] outline-none focus:border-[#392ee5] focus:ring-2 focus:ring-[#392ee5]/20"
        >
          <option value="en">{labels.localeOptionEn}</option>
          <option value="zh-TW">{labels.localeOptionZhTw}</option>
        </select>
        <p className="text-xs text-[#667085]">{labels.localeHelp}</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex min-h-9 items-center justify-center rounded-[10px] bg-[#392ee5] px-4 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(57,46,229,0.25)] hover:bg-[#2f25c9] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? labels.saving : labels.save}
        </button>
        {error ? (
          <p role="alert" className="text-sm text-[#b42318]">
            {error}
          </p>
        ) : savedAt ? (
          <p className="text-sm text-[#067647]">{savedAt.toLocaleTimeString()}</p>
        ) : null}
      </div>
    </form>
  );
}

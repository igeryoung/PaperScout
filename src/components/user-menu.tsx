'use client';

import { useState } from 'react';
import Link from 'next/link';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ChevronDown } from 'lucide-react';

type UserMenuUser = {
  name: string | null;
  email: string;
  avatarUrl: string | null;
};

export type UserMenuLabels = {
  avatarAria: string;
  signedInTitle: string;
  accountMenuAria: string;
  account: string;
  viewHistory: string;
  viewHistoryDisabledTitle: string;
  collect: string;
  collectDisabledTitle: string;
  signOut: string;
  signOutFailed: string;
};

export function UserMenu({ user, labels }: { user: UserMenuUser; labels: UserMenuLabels }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const displayName = user.name ?? user.email;

  const handleSignOut = async () => {
    setError(null);
    setPending(true);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok && res.status !== 204) {
        setError(labels.signOutFailed);
        setPending(false);
        return;
      }
      window.location.assign('/');
    } catch {
      setError(labels.signOutFailed);
      setPending(false);
    }
  };

  return (
    <DropdownMenu.Root>
      {user.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatarUrl}
          alt={labels.avatarAria}
          title={labels.signedInTitle}
          aria-hidden
          className="h-8 w-8 rounded-full object-cover shadow-[inset_0_0_0_1px_rgba(17,24,39,0.08)]"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          aria-hidden
          title={labels.signedInTitle}
          className="h-8 w-8 rounded-full bg-[radial-gradient(circle_at_50%_36%,#f7c7b5_0_22%,transparent_23%),radial-gradient(circle_at_50%_78%,#263238_0_31%,transparent_32%),linear-gradient(#dfe8ff,#f9f5ff)] shadow-[inset_0_0_0_1px_rgba(17,24,39,0.08)]"
        />
      )}
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={labels.accountMenuAria}
          className="grid h-9 w-9 place-items-center rounded-[10px] text-[#111827] hover:bg-[#f5f7fb] data-[state=open]:bg-[#eef0f7]"
        >
          <ChevronDown aria-hidden className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-xl border border-[#e5e9f3] bg-white p-1 shadow-[0_18px_40px_rgba(17,24,39,0.12)]"
        >
          <DropdownMenu.Label className="flex items-center gap-3 px-3 py-2.5">
            {user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.avatarUrl}
                alt=""
                aria-hidden
                className="h-9 w-9 shrink-0 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span
                aria-hidden
                className="h-9 w-9 shrink-0 rounded-full bg-[radial-gradient(circle_at_50%_36%,#f7c7b5_0_22%,transparent_23%),radial-gradient(circle_at_50%_78%,#263238_0_31%,transparent_32%),linear-gradient(#dfe8ff,#f9f5ff)]"
              />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#111827]">
                {displayName}
              </span>
              <span className="block truncate text-xs text-[#667085]">{user.email}</span>
            </span>
          </DropdownMenu.Label>

          <DropdownMenu.Separator className="my-1 h-px bg-[#eef0f7]" />

          <DropdownMenu.Item asChild>
            <Link
              href="/account"
              className="block cursor-pointer rounded-md px-3 py-2 text-sm text-[#111827] outline-none data-[highlighted]:bg-[#f5f7fb]"
            >
              {labels.account}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            disabled
            title={labels.viewHistoryDisabledTitle}
            className="block cursor-not-allowed rounded-md px-3 py-2 text-sm text-[#98a2b3] outline-none"
          >
            {labels.viewHistory}
          </DropdownMenu.Item>

          <DropdownMenu.Item
            disabled
            title={labels.collectDisabledTitle}
            className="block cursor-not-allowed rounded-md px-3 py-2 text-sm text-[#98a2b3] outline-none"
          >
            {labels.collect}
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-[#eef0f7]" />

          <DropdownMenu.Item
            onSelect={() => {
              void handleSignOut();
            }}
            disabled={pending}
            className="block cursor-pointer rounded-md px-3 py-2 text-sm text-[#111827] outline-none data-[highlighted]:bg-[#f5f7fb] data-[disabled]:cursor-wait data-[disabled]:opacity-60"
          >
            {labels.signOut}
          </DropdownMenu.Item>

          {error ? (
            <p role="alert" className="px-3 py-2 text-xs text-[#b42318]">
              {error}
            </p>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

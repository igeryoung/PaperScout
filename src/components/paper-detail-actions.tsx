'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, Heart } from 'lucide-react';
import type { UserPaperStatus } from '@prisma/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

type ActionLabels = {
  actionsHeader: string;
  save: string;
  saved: string;
  statusHeader: string;
  notesHeader: string;
  notePlaceholder: string;
  noteSavedJustNow: string;
  noteSaving: string;
  noteSaveFailed: string;
  signedOutTitle: string;
  signedOutBody: string;
  signedOutCta: string;
  statuses: Record<UserPaperStatus, string>;
};

type PaperDetailActionsProps = {
  paperId: string;
  signedIn: boolean;
  initialLiked: boolean;
  initialStatus: UserPaperStatus | null;
  initialNote: string;
  labels: ActionLabels;
};

const STATUS_OPTIONS: UserPaperStatus[] = ['UNREAD', 'READING', 'READ', 'ARCHIVED'];

function statusTone(status: UserPaperStatus) {
  if (status === 'READ') return 'border-[#cfe9df] bg-[#e9f7f2] text-[#087d6c]';
  if (status === 'READING') return 'border-[#d7d3ff] bg-[#eeedff] text-[#5848f5]';
  if (status === 'ARCHIVED') return 'border-[#e2e7ef] bg-[#f2f4f8] text-[#667085]';
  return 'border-[#f3dfb8] bg-[#fff7e6] text-[#9a6500]';
}

async function libraryRequest(url: string, init: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 401) {
    window.location.assign('/api/auth/google');
    return false;
  }
  if (!res.ok) throw new Error(`Library request failed: ${res.status}`);
  return true;
}

type NoteState = 'idle' | 'saving' | 'saved' | 'failed';

export function PaperDetailActions({
  paperId,
  signedIn,
  initialLiked,
  initialStatus,
  initialNote,
  labels,
}: PaperDetailActionsProps) {
  const [inLibrary, setInLibrary] = useState(initialStatus !== null);
  const [liked, setLiked] = useState(initialLiked);
  const [status, setStatus] = useState<UserPaperStatus>(initialStatus ?? 'UNREAD');
  const [note, setNote] = useState(initialNote);
  const [pending, setPending] = useState<'liked' | 'status' | null>(null);
  const [noteState, setNoteState] = useState<NoteState>('idle');
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNoteRef = useRef(initialNote);

  useEffect(
    () => () => {
      if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
      if (noteSavedTimerRef.current) clearTimeout(noteSavedTimerRef.current);
    },
    [],
  );

  if (!signedIn) {
    return (
      <div className="rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]">
        <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-[#eeedff] text-[#5848f5]">
          <BookmarkPlus aria-hidden className="h-5 w-5" />
        </div>
        <h3 className="text-base font-bold text-[#111827]">{labels.signedOutTitle}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-[#667085]">{labels.signedOutBody}</p>
        <Link
          href="/api/auth/google"
          className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-[10px] bg-[#392ee5] px-4 text-sm font-semibold text-white shadow-[0_6px_14px_rgba(57,46,229,0.25)] transition-colors hover:bg-[#2f25c9]"
        >
          {labels.signedOutCta}
        </Link>
      </div>
    );
  }

  const ensureInLibrary = async () => {
    if (inLibrary) return true;
    const ok = await libraryRequest(`/api/library/papers/${paperId}`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    if (ok) setInLibrary(true);
    return ok;
  };

  const toggleLiked = async () => {
    const next = !liked;
    setPending('liked');
    setLiked(next);
    try {
      const ready = await ensureInLibrary();
      if (!ready) {
        setLiked(!next);
        return;
      }
      const ok = await libraryRequest(`/api/library/papers/${paperId}`, {
        method: 'PATCH',
        body: JSON.stringify({ liked: next }),
      });
      if (!ok) setLiked(!next);
    } catch {
      setLiked(!next);
    } finally {
      setPending(null);
    }
  };

  const changeStatus = async (next: UserPaperStatus) => {
    const previous = status;
    setStatus(next);
    setPending('status');
    try {
      const ready = await ensureInLibrary();
      if (!ready) {
        setStatus(previous);
        return;
      }
      const ok = await libraryRequest(`/api/library/papers/${paperId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next }),
      });
      if (!ok) setStatus(previous);
    } catch {
      setStatus(previous);
    } finally {
      setPending(null);
    }
  };

  const scheduleNoteSave = (value: string) => {
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current);
    noteTimerRef.current = setTimeout(async () => {
      if (value === lastSavedNoteRef.current) return;
      setNoteState('saving');
      try {
        const ready = await ensureInLibrary();
        if (!ready) {
          setNoteState('failed');
          return;
        }
        const trimmed = value.trim();
        const ok = await libraryRequest(`/api/library/papers/${paperId}`, {
          method: 'PATCH',
          body: JSON.stringify({ note: trimmed ? value : null }),
        });
        if (!ok) {
          setNoteState('failed');
          return;
        }
        lastSavedNoteRef.current = value;
        setNoteState('saved');
        if (noteSavedTimerRef.current) clearTimeout(noteSavedTimerRef.current);
        noteSavedTimerRef.current = setTimeout(() => setNoteState('idle'), 2500);
      } catch {
        setNoteState('failed');
      }
    }, 700);
  };

  const onNoteChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNote(event.target.value);
    scheduleNoteSave(event.target.value);
  };

  const noteStatusText =
    noteState === 'saving'
      ? labels.noteSaving
      : noteState === 'saved'
        ? labels.noteSavedJustNow
        : noteState === 'failed'
          ? labels.noteSaveFailed
          : '';

  return (
    <div className="rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]">
        {labels.actionsHeader}
      </h3>

      <button
        type="button"
        onClick={() => void toggleLiked()}
        disabled={pending === 'liked'}
        aria-pressed={liked}
        className={cn(
          'mt-4 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-70',
          liked
            ? 'border-[#d7d3ff] bg-[#eeedff] text-[#5848f5] hover:bg-[#e3deff]'
            : 'border-[#d9e1ee] bg-white text-[#344054] hover:border-[#c9c8ff] hover:text-[#5848f5]',
        )}
      >
        <Heart
          aria-hidden
          className={cn('h-4 w-4', liked && 'fill-current')}
        />
        {liked ? labels.saved : labels.save}
      </button>

      <div className="mt-5">
        <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]">
          {labels.statusHeader}
        </label>
        <Select
          value={status}
          onValueChange={(next) => void changeStatus(next as UserPaperStatus)}
          disabled={pending === 'status'}
        >
          <SelectTrigger
            className={cn(
              'mt-2 h-9 w-full cursor-pointer rounded-full border px-3 text-xs font-extrabold',
              statusTone(status),
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {labels.statuses[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-5">
        <label
          htmlFor="paper-note"
          className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]"
        >
          {labels.notesHeader}
        </label>
        <textarea
          id="paper-note"
          value={note}
          onChange={onNoteChange}
          placeholder={labels.notePlaceholder}
          rows={5}
          className="mt-2 block w-full resize-y rounded-[10px] border border-[#d8dfeb] bg-[#fbfbff] px-3 py-2 text-sm leading-relaxed text-[#111827] placeholder:text-[#98a2b3] focus:border-[#392ee5] focus:outline-none focus:ring-2 focus:ring-[#392ee5]/20"
        />
        <p
          className={cn(
            'mt-1.5 min-h-[16px] text-[11.5px]',
            noteState === 'failed' ? 'text-[#b42318]' : 'text-[#8a94a6]',
          )}
          aria-live="polite"
        >
          {noteStatusText}
        </p>
      </div>
    </div>
  );
}

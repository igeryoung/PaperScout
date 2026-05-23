'use client';

import { useState } from 'react';
import { Bookmark, Star } from 'lucide-react';

type HomePaperActionsProps = {
  paperId: string;
  initialLiked: boolean;
  initialReadLater: boolean;
  favoriteLabel: string;
  readLaterLabel: string;
};

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

export function HomePaperActions({
  paperId,
  initialLiked,
  initialReadLater,
  favoriteLabel,
  readLaterLabel,
}: HomePaperActionsProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [readLater, setReadLater] = useState(initialReadLater);
  const [pending, setPending] = useState<'favorite' | 'readLater' | null>(null);
  const [failed, setFailed] = useState(false);

  const toggleFavorite = async () => {
    const next = !liked;
    setPending('favorite');
    setFailed(false);
    try {
      const ok = await libraryRequest(`/api/library/papers/${paperId}`, {
        method: 'PATCH',
        body: JSON.stringify({ liked: next }),
      });
      if (ok) setLiked(next);
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  };

  const saveReadLater = async () => {
    setPending('readLater');
    setFailed(false);
    try {
      const added = await libraryRequest(`/api/library/papers/${paperId}`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      if (!added) return;
      const updated = await libraryRequest(`/api/library/papers/${paperId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'UNREAD' }),
      });
      if (updated) setReadLater(true);
    } catch {
      setFailed(true);
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => {
          void toggleFavorite();
        }}
        className="inline-flex min-h-[33px] items-center gap-2 rounded-[7px] border border-[#d9e1ee] bg-white px-3 text-[13px] text-[#344054] hover:border-[#c9c8ff] hover:text-[#392ee5] disabled:cursor-wait disabled:opacity-70"
        aria-pressed={liked}
      >
        <Star aria-hidden className={liked ? 'h-4 w-4 fill-[#5b4df1] text-[#5b4df1]' : 'h-4 w-4'} />
        {favoriteLabel}
      </button>
      <button
        type="button"
        disabled={pending !== null}
        onClick={() => {
          void saveReadLater();
        }}
        className="inline-flex min-h-[33px] items-center gap-2 rounded-[7px] border border-[#d9e1ee] bg-white px-3 text-[13px] text-[#344054] hover:border-[#c9c8ff] hover:text-[#392ee5] disabled:cursor-wait disabled:opacity-70"
        aria-pressed={readLater}
      >
        <Bookmark
          aria-hidden
          className={readLater ? 'h-4 w-4 fill-[#5b4df1] text-[#5b4df1]' : 'h-4 w-4'}
        />
        {readLaterLabel}
      </button>
      {failed ? (
        <span role="alert" className="text-[13px] text-[#b42318]">
          Failed
        </span>
      ) : null}
    </>
  );
}

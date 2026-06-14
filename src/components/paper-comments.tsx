'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MessageSquare, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PaperCommentItem = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string | null; avatarUrl: string | null };
};

export type PaperCommentLabels = {
  commentsHeader: string;
  commentsEmpty: string;
  commentPlaceholder: string;
  commentPost: string;
  commentPosting: string;
  commentFailed: string;
  commentDelete: string;
  commentAnonymous: string;
  commentSignInCta: string;
  commentSignInBody: string;
};

type PaperCommentsProps = {
  paperId: string;
  signedIn: boolean;
  currentUserId: string | null;
  initialComments: PaperCommentItem[];
  labels: PaperCommentLabels;
};

function formatCommentDate(iso: string) {
  return iso.slice(0, 10);
}

export function PaperComments({
  paperId,
  signedIn,
  currentUserId,
  initialComments,
  labels: t,
}: PaperCommentsProps) {
  const [comments, setComments] = useState<PaperCommentItem[]>(initialComments);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const submit = async () => {
    const content = draft.trim();
    if (!content || submitting) return;
    setSubmitting(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/papers/${paperId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      if (res.status === 401) {
        window.location.assign('/api/auth/google');
        return;
      }
      if (!res.ok) throw new Error(`Comment request failed: ${res.status}`);
      const data = (await res.json()) as { comment: PaperCommentItem };
      setComments((prev) => [data.comment, ...prev]);
      setDraft('');
    } catch {
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (commentId: string) => {
    const previous = comments;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      const res = await fetch(`/api/papers/${paperId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (!res.ok && res.status !== 404) throw new Error('delete failed');
    } catch {
      setComments(previous);
    }
  };

  return (
    <div>
      <h2 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#5848f5]">
        <MessageSquare aria-hidden className="h-4 w-4" />
        {t.commentsHeader}
        <span className="font-semibold text-[#98a2b3]">({comments.length})</span>
      </h2>

      {signedIn ? (
        <div className="mt-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.commentPlaceholder}
            rows={3}
            maxLength={5000}
            className="block w-full resize-y rounded-[10px] border border-[#d8dfeb] bg-[#fbfbff] px-3 py-2 text-sm leading-relaxed text-[#111827] placeholder:text-[#98a2b3] focus:border-[#392ee5] focus:outline-none focus:ring-2 focus:ring-[#392ee5]/20"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p
              className={cn('min-h-[16px] text-[11.5px]', failed ? 'text-[#b42318]' : 'text-[#8a94a6]')}
              aria-live="polite"
            >
              {failed ? t.commentFailed : ''}
            </p>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || draft.trim().length === 0}
              className="inline-flex h-8 cursor-pointer items-center justify-center rounded-[8px] bg-[#392ee5] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#2f25c9] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? t.commentPosting : t.commentPost}
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13px] leading-relaxed text-[#667085]">
          <Link href="/api/auth/google" className="font-semibold text-[#392ee5] hover:underline">
            {t.commentSignInCta}
          </Link>{' '}
          {t.commentSignInBody}
        </p>
      )}

      {comments.length === 0 ? (
        <p className="mt-4 text-[13px] text-[#98a2b3]">{t.commentsEmpty}</p>
      ) : (
        <ul className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-[10px] border border-[#edf1f7] bg-[#fbfcff] px-3 py-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {comment.user.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- small external avatar
                    <img
                      src={comment.user.avatarUrl}
                      alt=""
                      className="h-5 w-5 shrink-0 rounded-full"
                    />
                  ) : null}
                  <span className="truncate text-[12.5px] font-semibold text-[#344054]">
                    {comment.user.name ?? t.commentAnonymous}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-[#98a2b3]">
                    {formatCommentDate(comment.createdAt)}
                  </span>
                </div>
                {currentUserId !== null && comment.user.id === currentUserId ? (
                  <button
                    type="button"
                    onClick={() => void remove(comment.id)}
                    aria-label={t.commentDelete}
                    className="shrink-0 cursor-pointer text-[#98a2b3] transition-colors hover:text-[#b42318]"
                  >
                    <Trash2 aria-hidden className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="mt-1.5 text-[13.5px] leading-relaxed whitespace-pre-wrap text-[#1f2937]">
                {comment.content}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

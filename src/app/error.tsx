'use client';

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="text-muted-foreground text-sm">
        {error.message || 'An unexpected error occurred while loading this page.'}
      </p>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">
          Reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <button
        type="button"
        onClick={() => reset()}
        className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium"
      >
        Try again
      </button>
    </main>
  );
}

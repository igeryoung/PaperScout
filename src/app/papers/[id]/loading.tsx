export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <div className="bg-muted h-4 w-32 animate-pulse rounded" />
      <div className="space-y-3">
        <div className="bg-muted h-8 w-3/4 animate-pulse rounded" />
        <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
      </div>
      <div className="bg-muted h-48 w-full animate-pulse rounded-lg" />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-muted h-4 w-full animate-pulse rounded" />
        ))}
      </div>
    </main>
  );
}

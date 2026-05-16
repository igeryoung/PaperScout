export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-6 py-10">
      <div className="space-y-2">
        <div className="bg-muted h-3 w-32 animate-pulse rounded" />
        <div className="bg-muted h-8 w-80 animate-pulse rounded" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-muted h-40 w-full animate-pulse rounded-lg" />
        ))}
      </div>
    </main>
  );
}

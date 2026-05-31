const SHIMMER = 'animate-pulse rounded-md bg-[#eef0f6]';

export default function Loading() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8 sm:py-10">
      <div className="mb-6 h-4 w-32 animate-pulse rounded bg-[#eef0f6]" />

      <section className="rounded-2xl border border-[#e5e9f3] bg-gradient-to-b from-white to-[#fbfbff] p-6 shadow-[0_12px_32px_rgba(24,34,64,0.055)] sm:p-8">
        <div className="flex gap-2">
          <div className={`${SHIMMER} h-5 w-16`} />
          <div className={`${SHIMMER} h-5 w-24`} />
          <div className={`${SHIMMER} h-5 w-20`} />
        </div>
        <div className={`${SHIMMER} mt-4 h-7 w-3/4`} />
        <div className={`${SHIMMER} mt-2 h-7 w-1/2`} />
        <div className={`${SHIMMER} mt-4 h-4 w-2/3`} />
        <div className={`${SHIMMER} mt-2 h-4 w-1/3`} />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]">
            <div className={`${SHIMMER} mx-auto h-64 w-full max-w-md`} />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]"
            >
              <div className={`${SHIMMER} h-3 w-24`} />
              <div className="mt-3 space-y-2">
                <div className={`${SHIMMER} h-4 w-full`} />
                <div className={`${SHIMMER} h-4 w-11/12`} />
                <div className={`${SHIMMER} h-4 w-5/6`} />
              </div>
            </div>
          ))}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]">
            <div className={`${SHIMMER} h-3 w-20`} />
            <div className={`${SHIMMER} mt-2 h-9 w-24`} />
            <div className="mt-4 space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className={`${SHIMMER} h-2 w-full`} />
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-[#e5e9f3] bg-white p-5 shadow-[0_12px_32px_rgba(24,34,64,0.055)]">
            <div className={`${SHIMMER} h-3 w-24`} />
            <div className={`${SHIMMER} mt-4 h-10 w-full`} />
            <div className={`${SHIMMER} mt-5 h-9 w-full`} />
            <div className={`${SHIMMER} mt-5 h-24 w-full`} />
          </div>
        </aside>
      </div>
    </main>
  );
}

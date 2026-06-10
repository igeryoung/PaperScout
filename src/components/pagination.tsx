import Link from 'next/link';

export type PaginationLabels = {
  allShown: (n: number) => string;
  status: (current: number, total: number, items: number) => string;
  prev: string;
  next: string;
  aria: string;
};

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  labels,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  labels: PaginationLabels;
  /** Build the href for a given 1-based page (callers preserve their own query state). */
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) {
    return (
      <p className="text-center text-sm text-[#667085]">{labels.allShown(totalItems)}</p>
    );
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <nav
      className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e9f3] pt-4 text-sm"
      aria-label={labels.aria}
    >
      <p className="text-[#667085]">{labels.status(currentPage, totalPages, totalItems)}</p>
      <div className="flex flex-wrap items-center gap-2">
        {currentPage > 1 ? (
          <Link
            href={buildHref(currentPage - 1)}
            className="inline-flex min-h-9 items-center rounded-lg border border-[#d7deea] bg-white px-3 font-semibold text-[#344054] hover:text-[#392ee5]"
          >
            {labels.prev}
          </Link>
        ) : (
          <span className="inline-flex min-h-9 cursor-not-allowed items-center rounded-lg border border-[#d7deea] bg-[#f2f4f8] px-3 font-semibold text-[#98a2b3]">
            {labels.prev}
          </span>
        )}

        {pageNumbers.map((page) => (
          <Link
            key={page}
            href={buildHref(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={
              page === currentPage
                ? 'grid h-9 min-w-9 place-items-center rounded-lg bg-[#5b4df1] px-3 font-bold text-white'
                : 'grid h-9 min-w-9 place-items-center rounded-lg border border-[#d7deea] bg-white px-3 font-semibold text-[#344054] hover:text-[#392ee5]'
            }
          >
            {page}
          </Link>
        ))}

        {currentPage < totalPages ? (
          <Link
            href={buildHref(currentPage + 1)}
            className="inline-flex min-h-9 items-center rounded-lg border border-[#d7deea] bg-white px-3 font-semibold text-[#344054] hover:text-[#392ee5]"
          >
            {labels.next}
          </Link>
        ) : (
          <span className="inline-flex min-h-9 cursor-not-allowed items-center rounded-lg border border-[#d7deea] bg-[#f2f4f8] px-3 font-semibold text-[#98a2b3]">
            {labels.next}
          </span>
        )}
      </div>
    </nav>
  );
}

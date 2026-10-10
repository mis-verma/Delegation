import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Utility for intelligent Tailwind class merging */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types & Helpers ---
type PageToken = number | 'ellipsis';

const getPageList = (current: number, total: number): PageToken[] => {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);

  const pages: PageToken[] = [1];
  if (left > 2) pages.push('ellipsis');
  for (let i = left; i <= right; i++) pages.push(i);
  if (right < total - 1) pages.push('ellipsis');
  if (total > 1) pages.push(total);

  return pages;
};

interface PageNavProps {
  page: number;
  totalPages: number;
  /** Called with the new page number. Callers scroll their list back to the top here. */
  onPageChange: (page: number) => void;
  className?: string;
}

const PHONE_ARROW_CLASS = cn(
  "flex items-center justify-center size-11 rounded-xl border border-border/60 bg-surface text-text-secondary cursor-pointer transition-colors duration-150 ease-out",
  "hover:border-border-hover hover:text-text active:bg-surface-hover",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40",
  "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed",
);

// --- Main Component ---
export const PageNav = ({ page, totalPages, onPageChange, className }: PageNavProps) => {
  if (totalPages <= 1) return null;

  const pages = getPageList(page, totalPages);

  return (
    <nav 
      aria-label="Pagination" 
      className={cn("flex items-center justify-center w-full font-sans", className)}
    >
      {/* Phone: "<  Page 3 of 9  >". A row of number buttons does not fit at 320px and a page
          number is rarely the target on a phone anyway; next/previous is. */}
      <div className="flex sm:hidden items-center justify-center gap-3 w-full">
        <button
          type="button"
          onClick={() => page > 1 && onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
          className={PHONE_ARROW_CLASS}
        >
          <ChevronLeft className="size-5" strokeWidth={2.5} />
        </button>
        <p className="min-w-0 text-center t-card font-medium text-text-secondary tabular-nums" aria-live="polite">
          Page <span className="font-semibold text-text">{page}</span> of {totalPages}
        </p>
        <button
          type="button"
          onClick={() => page < totalPages && onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
          className={PHONE_ARROW_CLASS}
        >
          <ChevronRight className="size-5" strokeWidth={2.5} />
        </button>
      </div>

      <ul className="hidden sm:flex items-center gap-1.5">
        
        {/* Previous Button */}
        <li>
          <button
            type="button"
            onClick={() => page > 1 && onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Go to previous page"
            className={cn(
              "flex items-center gap-1.5 h-11 px-3 sm:px-4 text-sm sm:text-sm font-bold tracking-wide rounded-xl transition-all duration-200 cursor-pointer active:scale-95",
              "text-text-muted hover:bg-surface-hover hover:text-text",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/10",
              "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
            )}
          >
            <ChevronLeft className="size-4 sm:size-5" strokeWidth={2.5} />
            <span className="hidden sm:inline">Previous</span>
          </button>
        </li>

        {/* Page Numbers */}
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <li key={`ellipsis-${i}`} aria-hidden="true">
              <div className="flex items-center justify-center h-11 min-w-11 text-text-muted/60">
                <MoreHorizontal className="size-5" strokeWidth={2.5} />
              </div>
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onPageChange(p)}
                aria-current={p === page ? 'page' : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  "flex items-center justify-center h-11 min-w-11 px-2 text-sm sm:text-sm font-bold rounded-xl border transition-all duration-200 cursor-pointer active:scale-95",
                  "focus-visible:outline-none focus-visible:ring-4",
                  p === page
                    ? "bg-primary-600 border-primary-600 text-white hover:bg-primary-700 focus-visible:ring-primary-500/20"
                    : "border-transparent text-text-secondary hover:bg-surface-hover hover:border-border/60 hover:text-text focus-visible:ring-primary-500/10"
                )}
              >
                {p}
              </button>
            </li>
          )
        )}

        {/* Next Button */}
        <li>
          <button
            type="button"
            onClick={() => page < totalPages && onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Go to next page"
            className={cn(
              "flex items-center gap-1.5 h-11 px-3 sm:px-4 text-sm sm:text-sm font-bold tracking-wide rounded-xl transition-all duration-200 cursor-pointer active:scale-95",
              "text-text-muted hover:bg-surface-hover hover:text-text",
              "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/10",
              "disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
            )}
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight className="size-4 sm:size-5" strokeWidth={2.5} />
          </button>
        </li>
        
      </ul>
    </nav>
  );
};
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PANEL_CLASS } from '../../components/entityCard';
import { Skeleton } from '../../components/skeleton';

interface LazyWhenVisibleProps {
  children: ReactNode;
  minHeight?: string;
}

export const LazyWhenVisible = ({ children, minHeight = '10rem' }: LazyWhenVisibleProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    if (seen) return;
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [seen]);

  if (seen) return <>{children}</>;
  return (
    <div ref={ref} style={{ minHeight }} aria-hidden="true" className={`${PANEL_CLASS} flex flex-col overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 sm:px-5">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-6 w-10 rounded-full" />
      </div>
      <div className="flex flex-col divide-y divide-border/60">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex min-h-14 flex-col justify-center gap-1.5 px-4 py-3 sm:px-5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
        ))}
      </div>
    </div>
  );
};

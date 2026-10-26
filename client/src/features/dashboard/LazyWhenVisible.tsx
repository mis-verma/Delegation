import { useEffect, useRef, useState, type ReactNode } from 'react';

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
  return <div ref={ref} style={{ minHeight }} aria-hidden="true" />;
};

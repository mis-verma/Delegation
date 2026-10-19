import { useCallback, useMemo, useSyncExternalStore } from 'react';

const mediaQueryCache = new Map<string, MediaQueryList>();

function getMediaQueryList(query: string): MediaQueryList {
  let mql = mediaQueryCache.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mediaQueryCache.set(query, mql);
  }
  return mql;
}

export function useMediaQuery(query: string): boolean {
  const mql = useMemo(() => getMediaQueryList(query), [query]);
  const subscribe = useCallback(
    (callback: () => void) => {
      mql.addEventListener('change', callback);
      return () => mql.removeEventListener('change', callback);
    },
    [mql],
  );
  const getSnapshot = useCallback(() => mql.matches, [mql]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

export const useIsMobile = () => useMediaQuery('(max-width: 767px)');

export const usePrefersReducedMotion = () => useMediaQuery('(prefers-reduced-motion: reduce)');

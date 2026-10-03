import { useEffect, useState } from 'react';

/**
 * Current time in ms, refreshed on an interval (default 60s) and whenever the tab becomes visible
 * again. Lets "overdue" and "due today" checks stay true on a dashboard left open all day, instead
 * of freezing at the moment the page mounted.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMs]);

  return now;
}

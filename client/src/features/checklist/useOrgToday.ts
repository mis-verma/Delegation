import { useEffect, useState } from 'react';
import { todayPeriodBoundIso } from './checklistDisplay';

const dayKey = () => todayPeriodBoundIso().slice(0, 10);

/**
 * Today as the org's calendar day (YYYY-MM-DD), kept fresh: a page left open past midnight, or a
 * phone woken from sleep, rolls over to the new day instead of showing yesterday as "today".
 * Re-checked every minute and whenever the tab becomes visible or focused again; the state only
 * changes when the day actually does, so it never causes a needless render.
 */
export const useOrgToday = (): string => {
  const [today, setToday] = useState(dayKey);

  useEffect(() => {
    const refresh = () => setToday(dayKey());
    const timer = window.setInterval(refresh, 60_000);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
};

import { useEffect, useState } from 'react';
import { todayPeriodBoundIso } from './checklistDisplay';

const dayKey = () => todayPeriodBoundIso().slice(0, 10);

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

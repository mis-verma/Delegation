import { useCallback, useState } from 'react';
import { useAuth } from '../../../../context/AuthContext';
import { BI_MEASURES, type BiMeasure } from './biMetrics';

export type BiTopN = 5 | 10 | 0;

interface BiPrefs {
  measure: BiMeasure;
  topN: BiTopN;
  lowestFirst: boolean;
}

const DEFAULTS: BiPrefs = { measure: 'score', topN: 10, lowestFirst: true };

const read = (key: string): BiPrefs => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<BiPrefs>;
    return {
      measure: BI_MEASURES.find((m) => m === parsed.measure) ?? DEFAULTS.measure,
      topN: parsed.topN === 5 || parsed.topN === 10 || parsed.topN === 0 ? parsed.topN : DEFAULTS.topN,
      lowestFirst: typeof parsed.lowestFirst === 'boolean' ? parsed.lowestFirst : DEFAULTS.lowestFirst,
    };
  } catch {
    return DEFAULTS;
  }
};

export const useBiPrefs = () => {
  const { user } = useAuth();
  const key = `tm-bi-prefs-${user?.id ?? 'anon'}`;
  const [prefs, setPrefs] = useState<BiPrefs>(() => read(key));

  const update = useCallback((patch: Partial<BiPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });
  }, [key]);

  return { ...prefs, setMeasure: (measure: BiMeasure) => update({ measure }), setTopN: (topN: BiTopN) => update({ topN }), setLowestFirst: (lowestFirst: boolean) => update({ lowestFirst }) };
};

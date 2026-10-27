import { useState } from 'react';
import type { DateRangeValue } from '../../components';
import { endOfDay } from '../../lib/dateRange';
import { computeRange, PRESET_LABELS, type ReportPreset } from './dateRangePresets';

export type RangeMode = ReportPreset | 'custom';

export const useExportRange = (initial: RangeMode) => {
  const [mode, setMode] = useState<RangeMode>(initial);
  const [customRange, setCustomRange] = useState<DateRangeValue>({ from: null, to: null });

  const isCustom = mode === 'custom';
  const ready = !isCustom || (!!customRange.from && !!customRange.to);

  const resolve = (): { from?: string; to?: string } =>
    isCustom
      ? { from: customRange.from!.toISOString(), to: endOfDay(customRange.to!).toISOString() }
      : computeRange(mode, new Date());

  return {
    mode,
    setMode,
    customRange,
    setCustomRange,
    isCustom,
    ready,
    resolve,
    label: isCustom ? 'Selected range' : PRESET_LABELS[mode],
  };
};

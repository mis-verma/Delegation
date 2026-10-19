import { CalendarOff, Check, Clock, X } from 'lucide-react';
import { exportPct, type TableRows } from '../../../lib/exportTable';
import type { WeeklyCell, WeeklyCellState, WeeklyReport } from '../../../api/checklistInstances';

export const STATE: Record<WeeklyCellState, { label: string; tone: string; icon: typeof Check | null }> = {
  done: { label: 'Filled on time', tone: 'text-success', icon: Check },
  late: { label: 'Filled late', tone: 'text-warning', icon: Clock },
  missed: { label: 'Not filled', tone: 'text-danger', icon: X },
  open: { label: 'In progress', tone: 'text-primary-500', icon: null },
  holiday: { label: 'Holiday', tone: 'text-text-light', icon: CalendarOff },
  off: { label: 'No run', tone: 'text-text-light', icon: null },
  upcoming: { label: 'Not due yet', tone: 'text-text-light', icon: null },
  summary: { label: 'Month total', tone: 'text-text', icon: null },
};

const cellText = (cell: WeeklyCell): string | number | null => {
  if (cell.state === 'summary') return exportPct(cell.completion ?? null);
  const state = cell.state === 'open' && cell.done === 0 ? 'Not started' : STATE[cell.state].label;
  return cell.total && cell.runId ? `${state} (${cell.done}/${cell.total})` : state;
};

export const fillMatrixRows = (data: WeeklyReport): TableRows => {
  const head = ['Checklist', 'Store', ...data.columns.map((c) => (data.kind === 'month' ? c.label : c.key)), 'Completion %', 'Met deadline %', 'Answers right %', 'Still open'];
  const body = data.rows.map((r) => [
    r.name,
    r.storeName,
    ...r.cells.map(cellText),
    exportPct(r.completion),
    exportPct(r.rate),
    exportPct(r.compliance),
    r.open ?? 0,
  ]);
  return [head, ...body];
};


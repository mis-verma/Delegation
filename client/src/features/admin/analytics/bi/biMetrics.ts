import type { ExplorerBlock, ExplorerModule, ExplorerRow, ExplorerRowKind, MatrixBlockCell, MatrixCell } from '../../../../api/scores';
import { MODULE_LABEL, SCORE_LABEL, complianceLabel } from '../../../../lib/scoreLabels';

export type BiModule = ExplorerModule | 'all';
export type BiMeasure = 'score' | 'completion' | 'compliance' | 'onTime';

export const BI_MODULES: readonly ExplorerModule[] = ['checklist', 'ticket', 'delegation'];
export const BI_MEASURES: readonly BiMeasure[] = ['score', 'completion', 'compliance', 'onTime'];

export const parseBiModule = (v: string | null): BiModule => (v === 'checklist' || v === 'ticket' || v === 'delegation' ? v : 'all');

export const moduleTitle = (module: BiModule): string => (module === 'all' ? 'All modules' : MODULE_LABEL[module]);

export const measureLabel = (measure: BiMeasure, module: BiModule): string => {
  if (measure === 'score') return module === 'all' ? SCORE_LABEL.overall : 'Score';
  if (measure === 'completion') return SCORE_LABEL.completion;
  if (measure === 'onTime') return SCORE_LABEL.onTime;
  return module === 'all' ? 'Compliance' : complianceLabel(module);
};

export const blockValue = (b: ExplorerBlock, measure: BiMeasure): number | null => {
  if (b.due === 0) return null;
  if (measure === 'score') return b.score;
  if (measure === 'completion') return b.completion;
  if (measure === 'onTime') return b.onTimeOfFinishedPct;
  return b.compliance;
};

export const rowValue = (row: ExplorerRow, module: BiModule, measure: BiMeasure): number | null => {
  if (module === 'all') return row.totalDue === 0 ? null : row.overall;
  return blockValue(row[module], measure);
};

export const cellValue = (cell: MatrixCell | null, module: BiModule, measure: BiMeasure): number | null => {
  if (!cell) return null;
  if (module === 'all') return cell.totalDue === 0 ? null : cell.overall;
  const b = cell[module];
  if (b.due === 0) return null;
  if (measure === 'score') return b.score;
  if (measure === 'completion') return b.completion;
  if (measure === 'onTime') return b.onTime;
  return b.compliance;
};

export const cellDue = (cell: MatrixCell | null, module: BiModule): number => (cell ? (module === 'all' ? cell.totalDue : cell[module].due) : 0);

export const rowDue =(row: ExplorerRow, module: BiModule): number => (module === 'all' ? row.totalDue : row[module].due);

export const deltaOf = (value: number | null, previous: number | null | undefined): number | null =>
  value === null || previous == null ? null : Math.round((value - previous) * 10) / 10;

export const sortBiRows =(rows: readonly ExplorerRow[], module: BiModule, measure: BiMeasure, lowestFirst: boolean): ExplorerRow[] =>
  [...rows].sort((a, b) => {
    const x = rowValue(a, module, measure);
    const y = rowValue(b, module, measure);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    const diff = lowestFirst ? x - y : y - x;
    return diff || rowDue(b, module) - rowDue(a, module) || a.name.localeCompare(b.name);
  });

export interface DetailRow {
  id: string;
  name: string;
  kind: ExplorerRowKind;
  departmentName?: string;
  whole: MatrixCell;
}

const blockCell = (b: ExplorerBlock): MatrixBlockCell => ({
  due: b.due,
  done: b.done,
  late: b.late,
  score: b.score,
  completion: b.completion,
  compliance: b.compliance,
  onTime: b.onTimeOfFinishedPct,
});

export const detailFromRow = (r: ExplorerRow): DetailRow => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  ...(r.departmentName ? { departmentName: r.departmentName } : {}),
  whole: { totalDue: r.totalDue, overall: r.overall, checklist: blockCell(r.checklist), ticket: blockCell(r.ticket), delegation: blockCell(r.delegation) },
});

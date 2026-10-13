import type { ExplorerBlock, ExplorerModule, ExplorerParent, ExplorerRecurrence, ExplorerRow, ExplorerView } from '../../api/scores';
import type { TableRows } from '../../lib/exportTable';
import { exportPct } from '../../lib/exportTable';
import { MODULE_LABEL, complianceLabel, SCORE_LABEL, type ScoreModule } from '../../lib/scoreLabels';
import { windowFor, type ScorePeriod } from '../dashboard/scorePeriods';
import { checklistDrillHref, delegationDrillHref, ticketDrillHref, type DrillKind, type DrillSubject } from '../dashboard/scoreDrill';

export const MODULES: readonly ScoreModule[] = ['checklist', 'ticket', 'delegation'];
export type Measure = 'completion' | 'compliance';
export type SortKey = 'name' | 'overall' | 'due' | `${ScoreModule}.${Measure}`;

export const VIEW_LABEL: Record<ExplorerView, string> = { department: 'Departments', store: 'Stores', person: 'People', checklist: 'Checklists', module: 'Modules' };
export const NAME_HEAD: Record<ExplorerView, string> = { department: 'Department', store: 'Store', person: 'Person', checklist: 'Checklist', module: 'Module' };
export const ALL_VIEWS: readonly ExplorerView[] = ['department', 'store', 'person', 'checklist', 'module'];

export const RECURRENCE_OPTIONS: { value: ExplorerRecurrence; label: string }[] = [
  { value: 'all', label: 'Every kind' },
  { value: 'DAILY', label: 'Daily' },
  { value: 'WEEKLY', label: 'Weekly' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'QUARTERLY', label: 'Quarterly' },
  { value: 'YEARLY', label: 'Yearly' },
  { value: 'ONCE', label: 'One-time' },
];
export const MODULE_OPTIONS: { value: ExplorerModule | ''; label: string }[] = [
  { value: '', label: 'All modules' },
  { value: 'checklist', label: 'Checklists' },
  { value: 'ticket', label: 'Tickets' },
  { value: 'delegation', label: 'Delegations' },
];

const RECURRENCE_VALUES = RECURRENCE_OPTIONS.map((o) => o.value);
export const parseRecurrence = (v: string | null): ExplorerRecurrence => RECURRENCE_VALUES.find((x) => x === v) ?? 'all';
export const parseModule = (v: string | null): ExplorerModule | undefined => (v === 'checklist' || v === 'ticket' || v === 'delegation' ? v : undefined);
export const parseView = (v: string | null): ExplorerView | null => ALL_VIEWS.find((x) => x === v) ?? null;

// ---------------------------------------------------------------------------------------------
// The drill-down trail, kept in the address (?trail=...), so back, refresh and a shared link land on the same level.
// ---------------------------------------------------------------------------------------------

export type TrailItem = ExplorerParent;

export const parseTrail = (raw: string | null): TrailItem[] => {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((x): x is { id: string; kind: TrailItem['kind']; name: string } =>
        !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.name === 'string' && (x.kind === 'person' || x.kind === 'department' || x.kind === 'store'))
      .map((x) => ({ id: x.id, kind: x.kind, name: x.name }));
  } catch {
    return [];
  }
};
export const serializeTrail = (trail: readonly TrailItem[]): string | null => (trail.length ? JSON.stringify(trail) : null);

/** The views that make sense inside what you opened: a person has only checklists and modules to look at. */
export const viewsFor = (parentKind: TrailItem['kind'] | null, orgWide: boolean): ExplorerView[] => {
  if (parentKind === 'person') return ['checklist', 'module'];
  if (parentKind === 'department') return ['person', 'checklist', 'module'];
  if (parentKind === 'store') return ['department', 'person', 'checklist', 'module'];
  return orgWide ? ['department', 'store', 'person', 'checklist', 'module'] : ['department', 'person', 'checklist', 'module'];
};

export interface DrillTarget { view: ExplorerView; label: string }

/** Where a row can be opened to: its people, its checklists, its departments. */
export const drillTargets = (row: ExplorerRow): DrillTarget[] => {
  if (row.kind === 'department') return [{ view: 'person', label: 'See people' }, { view: 'checklist', label: 'See checklists' }];
  if (row.kind === 'store') return [{ view: 'department', label: 'See departments' }, { view: 'checklist', label: 'See checklists' }];
  if (row.kind === 'person') return [{ view: 'checklist', label: 'See checklists' }, { view: 'module', label: 'See by module' }];
  return [];
};

export const asTrailItem = (row: ExplorerRow): TrailItem | null =>
  row.kind === 'department' || row.kind === 'store' || row.kind === 'person' ? { id: row.id, kind: row.kind, name: row.name } : null;

// ---------------------------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------------------------

export const measureOf = (b: ExplorerBlock, measure: Measure): number | null => (measure === 'completion' ? b.completion : b.compliance);

/** Competition ranking by Overall, best first, among rows with enough work due. Others get no rank. */
export const rankById = (rows: readonly ExplorerRow[]): Map<string, number> => {
  const ranked = rows.filter((r) => r.rankable && r.overall !== null).sort((a, b) => (b.overall as number) - (a.overall as number));
  const map = new Map<string, number>();
  ranked.forEach((r, i) => {
    const prev = ranked[i - 1];
    map.set(r.id, prev && prev.overall === r.overall ? (map.get(prev.id) as number) : i + 1);
  });
  return map;
};

const sortValue = (r: ExplorerRow, key: SortKey): number | string | null => {
  if (r.totalDue === 0 && key !== 'name') return null;
  if (key === 'name') return r.name.toLowerCase();
  if (key === 'overall') return r.overall;
  if (key === 'due') return r.totalDue;
  const [mod, measure] = key.split('.') as [ScoreModule, Measure];
  return r[mod].due > 0 ? measureOf(r[mod], measure) : null;
};

/** Sorts a copy. Rows with nothing due, or no figure for the column, sink to the bottom whichever way it is sorted. */
export const sortRows = (rows: readonly ExplorerRow[], key: SortKey, ascending: boolean): ExplorerRow[] =>
  [...rows].sort((a, b) => {
    const nothingA = a.totalDue === 0;
    const nothingB = b.totalDue === 0;
    if (nothingA !== nothingB) return nothingA ? 1 : -1;
    const x = sortValue(a, key);
    const y = sortValue(b, key);
    if (x === null && y === null) return a.name.localeCompare(b.name);
    if (x === null) return 1;
    if (y === null) return -1;
    const diff = typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number);
    return (ascending ? diff : -diff) || a.name.localeCompare(b.name);
  });

// ---------------------------------------------------------------------------------------------
// Links to the actual items
// ---------------------------------------------------------------------------------------------

/** '2026-10-01' to '2026-10-31' is October when it is a whole calendar period back from today: the fill report opens on that period. */
export const periodOf = (from: string, to: string, today: string): { period: ScorePeriod; offset: number } | undefined => {
  for (const period of ['week', 'month', 'quarter', 'year'] as const) {
    const limit = period === 'week' ? 104 : period === 'month' ? 36 : period === 'quarter' ? 12 : 3;
    for (let offset = 0; offset >= -limit; offset--) {
      const w = windowFor(period, offset, today);
      if (w.from === from && (w.to === to || (offset === 0 && to <= w.to))) return { period, offset };
    }
  }
  return undefined;
};

export interface DrillLink { label: string; href: string }
export interface ItemLinkWindow { from: string; to: string; period?: { period: ScorePeriod; offset: number } }

/** The exact items behind one module's figures: each link opens only what its count says. */
export const itemLinksFor = (orgWide: boolean, subject: DrillSubject, win: ItemLinkWindow, row: ExplorerRow, module: ScoreModule): DrillLink[] => {
  const b = row[module];
  const href = (kind: DrillKind) =>
    module === 'ticket' ? ticketDrillHref(orgWide, subject, win.from, win.to, kind)
      : module === 'delegation' ? delegationDrillHref(subject, win.from, win.to, kind)
        : checklistDrillHref(orgWide, subject, win.from, win.to, kind, win.period);
  // A department's checklists open its fill report, which has no late or missed split of its own.
  if (module === 'checklist' && subject.kind === 'department') return b.due > 0 ? [{ label: 'Open fill report', href: href('notDone') }] : [];
  const links: DrillLink[] = [];
  // The run history has no "finished late" filter, so the late link for checklists opens all finished runs and says so.
  if (b.late > 0) links.push({ label: module === 'checklist' ? `All finished runs (${b.late} late)` : `Late (${b.late})`, href: href('late') });
  if (b.notDone > 0) links.push({ label: `Not done (${b.notDone})`, href: href('notDone') });
  return links;
};

// ---------------------------------------------------------------------------------------------
// Export: exactly the table on screen
// ---------------------------------------------------------------------------------------------

export const exportRowsFor = (view: ExplorerView, rows: readonly ExplorerRow[], ranks: ReadonlyMap<string, number>, modules: readonly ScoreModule[]): TableRows => {
  const withDepartment = view === 'person';
  const head: string[] = [NAME_HEAD[view], ...(withDepartment ? ['Department'] : []), 'Rank', SCORE_LABEL.overall, 'Items due'];
  for (const m of modules) {
    const name = MODULE_LABEL[m];
    head.push(
      `${name} due`, `${name} done`, `${name} ${SCORE_LABEL.completion.toLowerCase()} %`, `${name} ${complianceLabel(m).toLowerCase()} %`,
      `${name} ${SCORE_LABEL.onTime.toLowerCase()} %`, `${name} late`, `${name} not done`,
    );
  }
  head.push('Runs shared with others', 'Status');
  const body = rows.map((r) => {
    const cells: (string | number | null)[] = [r.name, ...(withDepartment ? [r.departmentName ?? ''] : []), ranks.get(r.id) ?? null, exportPct(r.overall), r.totalDue];
    for (const m of modules) {
      const b = r[m];
      cells.push(b.due, b.done, exportPct(b.completion), exportPct(b.compliance), exportPct(b.onTimeOfFinishedPct), b.late, b.notDone);
    }
    cells.push(r.shared.runsSharedWithOthers, r.left ? 'Left' : r.inactive ? 'Inactive' : '');
    return cells;
  });
  return [head, ...body];
};

export const modulesForFilter = (module: ExplorerModule | undefined): readonly ScoreModule[] => (module ? [module] : MODULES);

/** One plain line on why the rows may add up to more than the total, or null when nothing is shared. */
export const sharingLine = (view: ExplorerView, s: { runsWithSeveralAssignees: number; runsAcrossDepartments: number; runsWithoutAssignee: number }): string | null => {
  const parts: string[] = [];
  const noun = (n: number) => (n === 1 ? 'checklist run is' : 'checklist runs are');
  if (view === 'department' && s.runsAcrossDepartments > 0) {
    parts.push(`${s.runsAcrossDepartments} ${noun(s.runsAcrossDepartments)} shared by several departments, so department rows can add up to more than the total.`);
  } else if (view === 'person' && s.runsWithSeveralAssignees > 0) {
    parts.push(`${s.runsWithSeveralAssignees} ${noun(s.runsWithSeveralAssignees)} shared by several people, so people rows can add up to more than the total.`);
  }
  if ((view === 'department' || view === 'person') && s.runsWithoutAssignee > 0) {
    parts.push(`${s.runsWithoutAssignee} ${s.runsWithoutAssignee === 1 ? 'run has' : 'runs have'} nobody assigned and ${view === 'person' ? 'sit on the Unassigned row' : 'are in no department'}.`);
  }
  return parts.length ? parts.join(' ') : null;
};

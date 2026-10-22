import { memo } from 'react';
import { ArrowDown, ArrowUp, Building2, ChevronRight, UserMinus, Users, PowerOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ExplorerRow, ExplorerView } from '../../api/scores';
import { MODULE_LABEL, SCORE_LABEL, complianceLabel, type ScoreModule } from '../../lib/scoreLabels';
import { NAME_HEAD, drillTargets, isForeignDepartment, isHomeDepartment, measureOf, type Measure, type ScoreScope, type SortKey } from './scoresDisplay';
import { TABLE_FRAME_CLASS } from './controlStyles';
import { ScorePct } from './ScorePct';
import { ScoreChip } from './ScoreChip';
import { MobileScoreRow } from './MobileScoreRow';
import { DepartmentLine, NumCell, NumHead, SortHead } from './scoreTableParts';

const MEASURES: readonly Measure[] = ['completion', 'compliance'];
const measureName = (m: ScoreModule, measure: Measure) => (measure === 'completion' ? SCORE_LABEL.completion : complianceLabel(m));

const StatusTag = ({ row }: { row: ExplorerRow }) => {
  if (row.left) return <ScoreChip label="Left" icon={UserMinus} />;
  if (row.inactive) return <ScoreChip label="Inactive" icon={PowerOff} />;
  return null;
};

const SharedMarker = ({ row }: { row: ExplorerRow }) => {
  const n = row.shared.runsSharedWithOthers;
  if (n <= 0) return null;
  return (
    <ScoreChip label={`${n} shared`} icon={Users} title={`${n} checklist ${n === 1 ? 'run is' : 'runs are'} shared with other people or departments`} />
  );
};

const NameBlock = ({ row, view, scope }: { row: ExplorerRow; view: ExplorerView; scope?: ScoreScope }) => (
  <span className="flex min-w-0 flex-col gap-0.5 text-left">
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2">{row.name}</span>
      <StatusTag row={row} />
      {isHomeDepartment(row, scope) && <ScoreChip label="Your department" icon={Building2} tone="success" />}
    </span>
    {row.kind === 'person' && <DepartmentLine name={row.departmentName} />}
    {(row.recurrence || row.shared.runsSharedWithOthers > 0 || row.totalDue === 0) && (
      <span className="flex flex-wrap items-center gap-1.5">
        {row.recurrence && view === 'checklist' && <span className="t-meta text-text-muted">{row.recurrence.charAt(0) + row.recurrence.slice(1).toLowerCase().replace('_', '-')}</span>}
        <SharedMarker row={row} />
        {row.totalDue === 0 && <span className="t-meta text-text-muted">Nothing due</span>}
      </span>
    )}
  </span>
);

interface ScoresTableProps {
  view: ExplorerView;
  rows: readonly ExplorerRow[];
  ranks: ReadonlyMap<string, number>;
  modules: readonly ScoreModule[];
  sortKey: SortKey;
  ascending: boolean;
  onSort: (key: SortKey) => void;
  onOpen: (row: ExplorerRow) => void;
  onDrill: (row: ExplorerRow, view: ExplorerView) => void;
  caption: string;
  scope?: ScoreScope;
}

export const ScoresTable = memo(({ view, rows, ranks, modules, sortKey, ascending, onSort, onOpen, onDrill, caption, scope }: ScoresTableProps) => (
  <div className={TABLE_FRAME_CLASS}>
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead className="sticky top-0 z-20">
        <tr>
          <NumHead rowSpan={2} className="min-w-14 bg-surface-hover align-bottom">Rank</NumHead>
          <th scope="col" rowSpan={2} aria-sort={sortKey === 'name' ? (ascending ? 'ascending' : 'descending') : 'none'} className="sticky left-0 z-30 bg-surface-hover px-3 py-2 align-bottom">
            <button type="button" onClick={() => onSort('name')} className="inline-flex min-h-8 pointer-coarse:min-h-11 items-center gap-0.5 t-meta font-display font-semibold text-text-secondary outline-none hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40">
              {NAME_HEAD[view]}
              {sortKey === 'name' && (ascending ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />)}
            </button>
          </th>
          <SortHead label={SCORE_LABEL.overall} sortKey="overall" active={sortKey} ascending={ascending} onSort={onSort} rowSpan={2} className="border-l border-border/60 align-bottom" />
          <SortHead label={SCORE_LABEL.due} sortKey="due" active={sortKey} ascending={ascending} onSort={onSort} rowSpan={2} className="align-bottom" />
          {modules.map((m) => <th key={m} scope="colgroup" colSpan={MEASURES.length} className="border-l border-border/60 bg-surface-hover px-3 pt-2 text-right t-meta font-display font-bold text-text">{MODULE_LABEL[m]}</th>)}
          <th scope="col" rowSpan={2} className="border-l border-border/60 bg-surface-hover"><span className="sr-only">Open</span></th>
        </tr>
        <tr>
          {modules.flatMap((m) => MEASURES.map((ms, i) => (
            <SortHead key={`${m}.${ms}`} label={measureName(m, ms)} sortKey={`${m}.${ms}`} active={sortKey} ascending={ascending} onSort={onSort} className={i === 0 ? 'border-l border-border/60' : ''} />
          )))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const target = isForeignDepartment(r, scope) ? undefined : drillTargets(r)[0];
          return (
            <tr key={`${r.kind}:${r.id}`} onClick={() => onOpen(r)} className={cn('group cursor-pointer border-t border-border/60', isHomeDepartment(r, scope) && 'bg-primary-500/5')}>
              <NumCell meta className="font-display font-bold text-text-secondary transition-colors group-hover:bg-surface-hover">{ranks.get(r.id) ?? '-'}</NumCell>
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 font-normal transition-colors group-hover:bg-surface-hover">
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r); }} className="flex min-h-9 pointer-coarse:min-h-11 items-center text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
                  <NameBlock row={r} view={view} scope={scope} />
                </button>
              </th>
              <NumCell className="border-l border-border/60 font-display transition-colors group-hover:bg-surface-hover">{r.totalDue === 0 ? <span className="text-text-light">-</span> : <ScorePct value={r.overall} strong />}</NumCell>
              <NumCell className="text-text-secondary transition-colors group-hover:bg-surface-hover">{r.totalDue}</NumCell>
              {modules.flatMap((m) => MEASURES.map((ms, i) => (
                <NumCell key={`${m}.${ms}`} className={cn('transition-colors group-hover:bg-surface-hover', i === 0 && 'border-l border-border/60')}>
                  {r[m].due === 0 ? <span className="text-text-light">-</span> : <ScorePct value={measureOf(r[m], ms)} />}
                </NumCell>
              )))}
              <td className="border-l border-border/60 px-1 py-1 text-center transition-colors group-hover:bg-surface-hover">
                {target && (
                  <button
                    type="button"
                    aria-label={`${target.label}: ${r.name}`}
                    onClick={(e) => { e.stopPropagation(); onDrill(r, target.view); }}
                    className="inline-flex size-9 pointer-coarse:size-11 items-center justify-center rounded-lg text-text-muted outline-none transition-colors hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <ChevronRight className="size-4" aria-hidden="true" />
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
));
ScoresTable.displayName = 'ScoresTable';

export const ScoresMobileList = ({ view, rows, ranks, modules, onOpen, scope }: { view: ExplorerView; rows: readonly ExplorerRow[]; ranks: ReadonlyMap<string, number>; modules: readonly ScoreModule[]; onOpen: (row: ExplorerRow) => void; scope?: ScoreScope }) => (
  <ol className="flex flex-col gap-2 md:hidden">
    {rows.map((r) => (
      <MobileScoreRow
        key={`${r.kind}:${r.id}`}
        rank={ranks.get(r.id) ?? null}
        title={<NameBlock row={r} view={view} scope={scope} />}
        overall={r.totalDue === 0 ? null : r.overall}
        cells={modules.map((m) => ({ key: m, label: MODULE_LABEL[m], value: r[m].due === 0 ? null : r[m].score }))}
        onOpen={() => onOpen(r)}
      />
    ))}
  </ol>
);

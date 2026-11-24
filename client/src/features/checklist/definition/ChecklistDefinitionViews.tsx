import { memo } from 'react';
import { Link } from 'react-router';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DepartmentChip } from '../../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS } from '../../../components/dataTable';
import type { ChecklistDefinition } from '../../../api/checklistDefinitions';
import { plural, smallRateToneClass } from '../checklistDisplay';
import { CHECKLIST_ICON_MAP } from './checklistIconMap';
import { ChecklistIconTile } from './ChecklistIconTile';
import { DefinitionActions } from './DefinitionActions';
import { useDefinitionDelete } from './useDefinitionDelete';
import { scheduleLabel } from './scheduleLabel';

export interface DefinitionViewProps {
  definitions: readonly ChecklistDefinition[];
  selectionMode: boolean;
  selection: ReadonlySet<string>;
  onToggleSelected: (id: string) => void;
}

const SelectBox = ({ selected, label }: { selected: boolean; label: string }) => (
  <span
    role="checkbox"
    aria-checked={selected}
    aria-label={label}
    className={cn(
      'flex size-6 shrink-0 items-center justify-center rounded-md border-2 transition-colors duration-150',
      selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-hover text-transparent',
    )}
  >
    <Check size={14} strokeWidth={3} aria-hidden />
  </span>
);

const rateOf = (d: ChecklistDefinition): number | null => d.currentRate ?? d.completionRate;

const RateText = ({ value }: { value: number | null }) =>
  value === null
    ? <span className="text-text-muted">No runs</span>
    : <span className={cn('font-bold tabular-nums', value === 100 ? 'text-success' : smallRateToneClass(value))}>{value}%</span>;

const NameCell = ({ definition, selectionMode, selected, onToggle }: { definition: ChecklistDefinition; selectionMode: boolean; selected: boolean; onToggle: () => void }) => {
  const Icon = CHECKLIST_ICON_MAP[definition.icon];
  const title = 'min-w-0 break-words text-sm font-display font-bold leading-snug text-text line-clamp-2';
  return (
    <div className="flex min-w-0 items-center gap-3">
      {selectionMode ? <SelectBox selected={selected} label={`Select ${definition.name}`} /> : <ChecklistIconTile icon={Icon} name={definition.name} />}
      {selectionMode ? (
        <button type="button" onClick={onToggle} aria-pressed={selected} className={cn(title, 'cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40')}>{definition.name}</button>
      ) : (
        <Link to={`/admin/scheduled-checklists/${definition.id}`} className={cn(title, 'outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-500/40')} title={definition.name}>{definition.name}</Link>
      )}
    </div>
  );
};

const TableRow = memo(({ definition, selectionMode, selected, onToggle }: { definition: ChecklistDefinition; selectionMode: boolean; selected: boolean; onToggle: (id: string) => void }) => {
  const { remove, isDeleting } = useDefinitionDelete(definition);
  const firstDepartment = definition.departmentNames[0];
  const moreDepartments = definition.departmentNames.length - 1;
  return (
    <tr className={cn(TR_CLASS, 'cursor-default transition-colors duration-150 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 even:bg-slate-50/40 dark:even:bg-slate-800/20', selected && 'bg-primary-500/5 hover:bg-primary-500/8', isDeleting && 'pointer-events-none opacity-50')}>
      <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
        <NameCell definition={definition} selectionMode={selectionMode} selected={selected} onToggle={() => onToggle(definition.id)} />
      </td>
      <td className={cn(TD_CLASS, 'whitespace-nowrap')}>{scheduleLabel(definition)}</td>
      <td className={cn(TD_CLASS, NUM_CLASS)}>{definition.storeIds.length}</td>
      <td className={cn(TD_CLASS, NUM_CLASS)}>{definition.items.length}</td>
      <td className={TD_CLASS}>
        {firstDepartment ? (
          <span className="flex items-center gap-1.5">
            <DepartmentChip name={firstDepartment} />
            {moreDepartments > 0 && <span className="t-meta tabular-nums text-text-muted">+{moreDepartments}</span>}
          </span>
        ) : (
          <span className="text-text-muted">{definition.assigneeIds.length === 0 ? 'Nobody assigned' : 'None'}</span>
        )}
      </td>
      <td className={cn(TD_CLASS, NUM_CLASS)}><RateText value={rateOf(definition)} /></td>
      <td className={TD_CLASS}>{selectionMode ? null : <DefinitionActions definition={definition} onDelete={() => { void remove(); }} deleting={isDeleting} />}</td>
    </tr>
  );
});
TableRow.displayName = 'DefinitionTableRow';

export const ChecklistDefinitionTable = memo(({ definitions, selectionMode, selection, onToggleSelected }: DefinitionViewProps) => (
  <div className={TABLE_FRAME_CLASS}>
    <table className="w-full min-w-[52rem] border-collapse">
      <caption className="sr-only">Recurring checklists</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>Checklist</th>
          <th scope="col" className={TH_CLASS}>Repeats</th>
          <th scope="col" className={cn(TH_CLASS, 'text-right')}>Stores</th>
          <th scope="col" className={cn(TH_CLASS, 'text-right')}>Questions</th>
          <th scope="col" className={TH_CLASS}>Department</th>
          <th scope="col" className={cn(TH_CLASS, 'text-right')}>Completion</th>
          <th scope="col" className={TH_CLASS}><span className="sr-only">Status and actions</span></th>
        </tr>
      </thead>
      <tbody>
        {definitions.map((d) => (
          <TableRow key={d.id} definition={d} selectionMode={selectionMode} selected={selection.has(d.id)} onToggle={onToggleSelected} />
        ))}
      </tbody>
    </table>
  </div>
));
ChecklistDefinitionTable.displayName = 'ChecklistDefinitionTable';

const ListRow = memo(({ definition, selectionMode, selected, onToggle }: { definition: ChecklistDefinition; selectionMode: boolean; selected: boolean; onToggle: (id: string) => void }) => {
  const { remove, isDeleting } = useDefinitionDelete(definition);
  return (
    <li className={cn(
      'flex items-center gap-3 rounded-xl border border-slate-200/70 dark:border-slate-700/50 bg-white dark:bg-slate-900/60 p-3 sm:px-4',
      'transition-all duration-150 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 hover:shadow-sm',
      selected && 'border-primary-500 bg-primary-500/5 hover:bg-primary-500/8',
      isDeleting && 'pointer-events-none opacity-50',
    )}>
      <div className="min-w-0 flex-1">
        <NameCell definition={definition} selectionMode={selectionMode} selected={selected} onToggle={() => onToggle(definition.id)} />
        <p className="mt-1 truncate t-meta font-display text-text-muted">
          {[scheduleLabel(definition), plural(definition.storeIds.length, 'store'), plural(definition.items.length, 'question')].join(' · ')}
        </p>
      </div>
      <span className="hidden shrink-0 t-meta font-display sm:inline"><RateText value={rateOf(definition)} /></span>
      {selectionMode ? null : <DefinitionActions definition={definition} onDelete={() => { void remove(); }} deleting={isDeleting} />}
    </li>
  );
});
ListRow.displayName = 'DefinitionListRow';

export const ChecklistDefinitionRows = memo(({ definitions, selectionMode, selection, onToggleSelected }: DefinitionViewProps) => (
  <ul className="flex flex-col gap-2">
    {definitions.map((d) => (
      <ListRow key={d.id} definition={d} selectionMode={selectionMode} selected={selection.has(d.id)} onToggle={onToggleSelected} />
    ))}
  </ul>
));
ChecklistDefinitionRows.displayName = 'ChecklistDefinitionRows';

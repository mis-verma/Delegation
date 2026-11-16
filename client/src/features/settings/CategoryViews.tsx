import { memo } from 'react';
import { Check, CircleOff, CirclePower, Tag, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIconTile, EntityCardActions, PriorityChip, StateChip } from '../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS, activateOnKey } from '../../components/dataTable';
import type { Category, CategoryTatRow } from '../../api/categories';
import { PRIORITY_CONFIG } from '../tickets/ticketDisplay';
import { useDepartmentsQuery } from './hook';
import { SLA_TEXT, departmentSummary, formatTatHours, slaTone } from './tatFormat';

export interface CategorySelection {
  active: boolean;
  ids: ReadonlySet<string>;
  toggle: (id: string) => void;
}

export const SelectMark = ({ selected, label }: { selected: boolean; label: string }) => (
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

export interface CategoryViewProps {
  items: readonly Category[];
  selection?: CategorySelection;
  usageById: Map<string, CategoryTatRow>;
  busyId?: string;
  onEdit: (category: Category) => void;
  onToggle: (category: Category) => void;
  onRemove?: (category: Category) => void;
}

const peopleText = (c: Category): string => {
  const people = c.assigneeIds ?? [];
  if (people.length === 0) return 'Department head picks';
  const first = `${people[0]!.firstName} ${people[0]!.lastName ?? ''}`.trim();
  return people.length > 1 ? `${first} +${people.length - 1}` : first;
};

const dueText = (c: Category): string => (c.tatHours ? formatTatHours(c.tatHours) : 'Default');

const Actions = ({ c, onEdit, onToggle, onRemove }: { c: Category } & Pick<CategoryViewProps, 'onEdit' | 'onToggle' | 'onRemove'>) => (
  <EntityCardActions
    onEdit={() => onEdit(c)}
    onDelete={onRemove ? () => onRemove(c) : undefined}
    isDeleting={false}
    editLabel={`Edit ${c.name}`}
    deleteLabel={`Delete ${c.name}`}
    extraItems={[{ label: c.isActive ? 'Deactivate' : 'Activate', icon: c.isActive ? CircleOff : CirclePower, onClick: () => onToggle(c) }]}
  />
);

const hasSla = (usage?: CategoryTatRow): boolean => !!usage && usage.total > 0 && usage.slaMetPct !== null;

const SlaText = ({ usage }: { usage?: CategoryTatRow }) =>
  usage && usage.total > 0 && usage.slaMetPct !== null ? (
    <span className={cn('font-bold tabular-nums', SLA_TEXT[slaTone(usage.slaMetPct)])}>{usage.slaMetPct}%</span>
  ) : (
    <span className="text-text-muted">–</span>
  );

const useDepartmentNames = (): ReadonlyMap<string, string> => {
  const { data: departments = [] } = useDepartmentsQuery();
  return new Map(departments.map((d) => [d.id, d.name]));
};

export const CategoryTable = memo(({ items, selection, usageById, busyId, onEdit, onToggle, onRemove }: CategoryViewProps) => {
  const names = useDepartmentNames();
  return (
  <div className={TABLE_FRAME_CLASS}>
    <table className="w-full min-w-[52rem] border-collapse">
      <caption className="sr-only">Ticket categories</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>Category</th>
          <th scope="col" className={TH_CLASS}>Department</th>
          <th scope="col" className={TH_CLASS}>Due</th>
          <th scope="col" className={TH_CLASS}>Priority</th>
          <th scope="col" className={TH_CLASS}>Goes to</th>
          <th scope="col" className={cn(TH_CLASS, 'text-right')}>On time</th>
          <th scope="col" className={TH_CLASS}>Status</th>
          <th scope="col" className={TH_CLASS}><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {items.map((c) => (
          <tr
            key={c.id}
            tabIndex={0}
            onClick={() => (selection?.active ? selection.toggle(c.id) : onEdit(c))}
            onKeyDown={activateOnKey(() => (selection?.active ? selection.toggle(c.id) : onEdit(c)))}
            className={cn(TR_CLASS, selection?.ids.has(c.id) && 'bg-primary-500/5', busyId === c.id && 'pointer-events-none opacity-50')}
          >
            <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
              <div className="flex min-w-0 items-center gap-2">
                {selection?.active && <SelectMark selected={selection.ids.has(c.id)} label={`Select ${c.name}`} />}
                <ColorIconTile icon={Tag} name={c.name} size="sm" />
                <span className={cn('min-w-0 break-words text-sm font-display font-bold leading-snug line-clamp-2', c.isActive ? 'text-text' : 'text-text-secondary')} title={c.name}>{c.name}</span>
              </div>
            </td>
            <td className={TD_CLASS}>{departmentSummary(c, names) ?? c.departmentId?.name ?? 'No department'}</td>
            <td className={cn(TD_CLASS, 'tabular-nums')}>{dueText(c)}</td>
            <td className={TD_CLASS}>{c.priority ? <PriorityChip meta={PRIORITY_CONFIG[c.priority]} /> : <span className="text-text-muted">Not set</span>}</td>
            <td className={cn(TD_CLASS, 'max-w-48 truncate')} title={peopleText(c)}>{peopleText(c)}</td>
            <td className={cn(TD_CLASS, NUM_CLASS)}><SlaText usage={usageById.get(c.id)} /></td>
            <td className={TD_CLASS}><StateChip active={c.isActive} label={c.isActive ? 'Active' : 'Inactive'} size="sm" /></td>
            <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
              {!selection?.active && <Actions c={c} onEdit={onEdit} onToggle={onToggle} onRemove={onRemove} />}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
});
CategoryTable.displayName = 'CategoryTable';

export const CategoryRows = memo(({ items, selection, usageById, busyId, onEdit, onToggle, onRemove }: CategoryViewProps) => {
  const names = useDepartmentNames();
  return (
  <ul className="flex flex-col gap-2">
    {items.map((c) => (
      <li
        key={c.id}
        className={cn('flex items-center gap-3 rounded-lg border border-border/60 bg-surface p-2.5 sm:px-3', !c.isActive && 'bg-surface-hover/30', selection?.ids.has(c.id) && 'border-primary-500 bg-primary-500/5', busyId === c.id && 'pointer-events-none opacity-50')}
      >
        {selection?.active && <SelectMark selected={selection.ids.has(c.id)} label={`Select ${c.name}`} />}
        <ColorIconTile icon={Tag} name={c.name} size="sm" />
        <button type="button" onClick={() => (selection?.active ? selection.toggle(c.id) : onEdit(c))} aria-label={`Edit ${c.name}`} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
          <span className={cn('truncate t-card font-display font-bold', c.isActive ? 'text-text' : 'text-text-secondary')}>{c.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 truncate t-meta font-display text-text-muted">
            <Users className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{peopleText(c)}</span>
            {departmentSummary(c, names) && <span className="hidden truncate sm:inline">{`· ${departmentSummary(c, names)}`}</span>}
          </span>
        </button>
        <span className="hidden shrink-0 t-meta font-display font-semibold tabular-nums text-text-secondary sm:inline">{c.tatHours ? `Due ${dueText(c)}` : 'Default due time'}</span>
        {hasSla(usageById.get(c.id)) && <span className="hidden shrink-0 t-meta font-display md:inline"><SlaText usage={usageById.get(c.id)} /></span>}
        <StateChip active={c.isActive} label={c.isActive ? 'Active' : 'Inactive'} size="sm" />
        {!selection?.active && <Actions c={c} onEdit={onEdit} onToggle={onToggle} onRemove={onRemove} />}
      </li>
    ))}
  </ul>
  );
});
CategoryRows.displayName = 'CategoryRows';

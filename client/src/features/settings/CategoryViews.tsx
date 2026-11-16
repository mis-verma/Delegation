import { memo } from 'react';
import { CircleOff, CirclePower, Tag, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ColorIconTile, EntityCardActions, PriorityChip, StateChip } from '../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, NUM_CLASS, FIRST_COL_WIDTH_CLASS, activateOnKey } from '../../components/dataTable';
import type { Category, CategoryTatRow } from '../../api/categories';
import { PRIORITY_CONFIG } from '../tickets/ticketDisplay';
import { SLA_TEXT, formatTatHours, slaTone } from './tatFormat';

export interface CategoryViewProps {
  items: readonly Category[];
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

const SlaText = ({ usage }: { usage?: CategoryTatRow }) =>
  usage && usage.total > 0 && usage.slaMetPct !== null ? (
    <span className={cn('font-bold tabular-nums', SLA_TEXT[slaTone(usage.slaMetPct)])}>{usage.slaMetPct}%</span>
  ) : (
    <span className="text-text-muted">–</span>
  );

export const CategoryTable = memo(({ items, usageById, busyId, onEdit, onToggle, onRemove }: CategoryViewProps) => (
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
            onClick={() => onEdit(c)}
            onKeyDown={activateOnKey(() => onEdit(c))}
            className={cn(TR_CLASS, busyId === c.id && 'pointer-events-none opacity-50')}
          >
            <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
              <div className="flex min-w-0 items-center gap-2">
                <ColorIconTile icon={Tag} name={c.name} size="sm" />
                <span className={cn('min-w-0 break-words text-sm font-display font-bold leading-snug line-clamp-2', c.isActive ? 'text-text' : 'text-text-secondary')} title={c.name}>{c.name}</span>
              </div>
            </td>
            <td className={TD_CLASS}>{c.departmentId?.name ?? 'No department'}</td>
            <td className={cn(TD_CLASS, 'tabular-nums')}>{dueText(c)}</td>
            <td className={TD_CLASS}>{c.priority ? <PriorityChip meta={PRIORITY_CONFIG[c.priority]} /> : <span className="text-text-muted">Not set</span>}</td>
            <td className={cn(TD_CLASS, 'max-w-48 truncate')} title={peopleText(c)}>{peopleText(c)}</td>
            <td className={cn(TD_CLASS, NUM_CLASS)}><SlaText usage={usageById.get(c.id)} /></td>
            <td className={TD_CLASS}><StateChip active={c.isActive} label={c.isActive ? 'Active' : 'Inactive'} size="sm" /></td>
            <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
              <Actions c={c} onEdit={onEdit} onToggle={onToggle} onRemove={onRemove} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
));
CategoryTable.displayName = 'CategoryTable';

export const CategoryRows = memo(({ items, usageById, busyId, onEdit, onToggle, onRemove }: CategoryViewProps) => (
  <ul className="flex flex-col gap-2">
    {items.map((c) => (
      <li
        key={c.id}
        className={cn('flex items-center gap-3 rounded-lg border border-border/60 bg-surface p-2.5 sm:px-3', !c.isActive && 'bg-surface-hover/30', busyId === c.id && 'pointer-events-none opacity-50')}
      >
        <ColorIconTile icon={Tag} name={c.name} size="sm" />
        <button type="button" onClick={() => onEdit(c)} aria-label={`Edit ${c.name}`} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40">
          <span className={cn('truncate t-card font-display font-bold', c.isActive ? 'text-text' : 'text-text-secondary')}>{c.name}</span>
          <span className="flex min-w-0 items-center gap-1.5 truncate t-meta font-display text-text-muted">
            <Users className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{peopleText(c)}</span>
          </span>
        </button>
        <span className="hidden shrink-0 t-meta font-display font-semibold tabular-nums text-text-secondary sm:inline">Due {dueText(c)}</span>
        <span className="hidden shrink-0 t-meta font-display md:inline"><SlaText usage={usageById.get(c.id)} /></span>
        <StateChip active={c.isActive} label={c.isActive ? 'Active' : 'Inactive'} size="sm" />
        <Actions c={c} onEdit={onEdit} onToggle={onToggle} onRemove={onRemove} />
      </li>
    ))}
  </ul>
));
CategoryRows.displayName = 'CategoryRows';

import { memo } from 'react';
import { Clock3, History } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ENTITY_CARD_CLASS, EntityCardActions, IconChip } from '../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TH_CORNER_CLASS, TD_CLASS, TR_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS, activateOnKey } from '../../components/dataTable';
import type { Event } from '@/api/events';
import { EVENT_TYPE_GRADIENT, EVENT_TYPE_ICONS, EVENT_TYPE_LABELS, EVENT_TYPE_SOLID, whenLabel } from './eventDisplay';

export interface EventViewProps {
  items: readonly Event[];
  isPast: boolean;
  canManage: boolean;
  deletingId?: string;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
}

interface ActionsProps {
  event: Event;
  deleting: boolean;
  onEdit: (event: Event) => void;
  onDelete: (event: Event) => void;
}

const Actions = ({ event, deleting, onEdit, onDelete }: ActionsProps) => (
  <EntityCardActions
    onEdit={() => onEdit(event)}
    onDelete={() => onDelete(event)}
    isDeleting={deleting}
    editLabel={`Edit ${event.title}`}
    deleteLabel={`Delete ${event.title}`}
  />
);

const WhenChip = ({ iso, isPast }: { iso: string; isPast: boolean }) => (
  <IconChip
    icon={isPast ? History : Clock3}
    tone={isPast ? 'bg-surface-hover/80' : 'bg-primary-600 dark:bg-primary-400'}
    label={isPast ? `Past · ${whenLabel(iso)}` : whenLabel(iso)}
    labelClassName="tabular-nums"
  />
);

export const EventCards = memo(({ items, isPast, canManage, deletingId, onEdit, onDelete }: EventViewProps) => (
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
    {items.map((event) => {
      const Icon = EVENT_TYPE_ICONS[event.type];
      const deleting = deletingId === event.id;
      return (
        <article
          key={event.id}
          aria-busy={deleting || undefined}
          className={cn(ENTITY_CARD_CLASS, 'min-w-0 gap-3', isPast && 'bg-surface-hover/30', deleting && 'pointer-events-none opacity-40')}
        >
          <div className="flex items-start justify-between gap-2">
            <span
              className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-white ring-1 ring-inset ring-white/20', isPast && 'opacity-70')}
              style={{ background: EVENT_TYPE_GRADIENT[event.type] }}
              aria-hidden="true"
            >
              <Icon size={18} strokeWidth={2.25} />
            </span>
            {canManage && (
              <div className="-mr-2 -mt-2 shrink-0">
                <Actions event={event} deleting={deleting} onEdit={onEdit} onDelete={onDelete} />
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <h3 className={cn('line-clamp-2 t-card font-display font-bold leading-snug', isPast ? 'text-text-secondary' : 'text-text')}>{event.title}</h3>
            {event.description && <p className="line-clamp-3 text-sm leading-relaxed text-text-muted">{event.description}</p>}
          </div>
          <div className="mt-auto flex flex-wrap items-center gap-1.5">
            <IconChip icon={Icon} tone={EVENT_TYPE_SOLID[event.type]} label={EVENT_TYPE_LABELS[event.type]} />
            <WhenChip iso={event.eventDate} isPast={isPast} />
          </div>
        </article>
      );
    })}
  </div>
));
EventCards.displayName = 'EventCards';

export const EventRows = memo(({ items, isPast, canManage, deletingId, onEdit, onDelete }: EventViewProps) => (
  <ul className="flex flex-col gap-2">
    {items.map((event) => {
      const Icon = EVENT_TYPE_ICONS[event.type];
      const deleting = deletingId === event.id;
      return (
        <li
          key={event.id}
          aria-busy={deleting || undefined}
          className={cn('flex items-center gap-3 rounded-lg border border-border/60 bg-surface p-2.5 transition-colors duration-150 hover:border-border-hover sm:px-3', isPast && 'bg-surface-hover/30', deleting && 'pointer-events-none opacity-40')}
        >
          <span
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-white ring-1 ring-inset ring-white/20', isPast && 'opacity-70')}
            style={{ background: EVENT_TYPE_GRADIENT[event.type] }}
            aria-hidden="true"
          >
            <Icon size={16} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={cn('line-clamp-2 t-card font-display font-bold leading-snug', isPast ? 'text-text-secondary' : 'text-text')}>{event.title}</span>
            <span className="truncate t-meta text-text-muted sm:hidden">{EVENT_TYPE_LABELS[event.type]} · <span className="tabular-nums">{whenLabel(event.eventDate)}</span></span>
            {event.description && <span className="hidden truncate t-meta text-text-muted sm:block">{event.description}</span>}
          </div>
          <span className="hidden shrink-0 sm:inline-flex"><IconChip icon={Icon} tone={EVENT_TYPE_SOLID[event.type]} label={EVENT_TYPE_LABELS[event.type]} /></span>
          <span className="hidden shrink-0 md:inline-flex"><WhenChip iso={event.eventDate} isPast={isPast} /></span>
          {canManage && <Actions event={event} deleting={deleting} onEdit={onEdit} onDelete={onDelete} />}
        </li>
      );
    })}
  </ul>
));
EventRows.displayName = 'EventRows';

export const EventTable = memo(({ items, isPast, canManage, deletingId, onEdit, onDelete }: EventViewProps) => (
  <div className={TABLE_FRAME_CLASS}>
    <table className="w-full min-w-[44rem] border-collapse">
      <caption className="sr-only">{isPast ? 'Past events' : 'Upcoming events'}</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(TH_CLASS, TH_CORNER_CLASS)}>Event</th>
          <th scope="col" className={TH_CLASS}>Type</th>
          <th scope="col" className={TH_CLASS}>When</th>
          <th scope="col" className={TH_CLASS}>Details</th>
          {canManage && <th scope="col" className={TH_CLASS}><span className="sr-only">Actions</span></th>}
        </tr>
      </thead>
      <tbody>
        {items.map((event) => {
          const Icon = EVENT_TYPE_ICONS[event.type];
          const deleting = deletingId === event.id;
          const rowProps = canManage
            ? { tabIndex: 0, onClick: () => onEdit(event), onKeyDown: activateOnKey(() => onEdit(event)) }
            : {};
          return (
            <tr key={event.id} {...rowProps} className={cn(TR_CLASS, isPast && 'bg-surface-hover/30', deleting && 'pointer-events-none opacity-40')}>
              <td className={cn(TD_CLASS, TD_STICKY_CLASS, FIRST_COL_WIDTH_CLASS)}>
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white ring-1 ring-inset ring-white/20"
                    style={{ background: EVENT_TYPE_GRADIENT[event.type] }}
                    aria-hidden="true"
                  >
                    <Icon size={15} strokeWidth={2.25} />
                  </span>
                  <span className={cn('line-clamp-2 min-w-0 break-words text-sm font-display font-bold leading-snug', isPast ? 'text-text-secondary' : 'text-text')} title={event.title}>{event.title}</span>
                </div>
              </td>
              <td className={TD_CLASS}><IconChip icon={Icon} tone={EVENT_TYPE_SOLID[event.type]} label={EVENT_TYPE_LABELS[event.type]} /></td>
              <td className={cn(TD_CLASS, 'whitespace-nowrap tabular-nums')}>{whenLabel(event.eventDate)}</td>
              <td className={cn(TD_CLASS, 'max-w-64 truncate')} title={event.description ?? undefined}>{event.description || <span className="text-text-muted">None</span>}</td>
              {canManage && (
                <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
                  <Actions event={event} deleting={deleting} onEdit={onEdit} onDelete={onDelete} />
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
));
EventTable.displayName = 'EventTable';

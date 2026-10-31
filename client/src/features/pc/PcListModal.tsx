import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowUpRight, CalendarOff, ChevronRight, ClipboardCheck, ClipboardList, TicketCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '../../components/avatar';
import { Button } from '../../components/button';
import { EmptyState } from '../../components/emptyState';
import { Modal } from '../../components/modal';
import { Skeleton } from '../../components/skeleton';
import { StatusBadge, type StatusVariant } from '../../components/statusBadge';
import { StoreChip } from '../../components/storeChip';
import { ToggleChip } from '../../components/toggleChip';
import { WaitChip } from '../../components/dueChip';
import { useNow } from '../../lib/useNow';

export type PcItemKind = 'ticket' | 'delegation' | 'checklist' | 'leave';

export interface PcListItem {
  id: string;
  kind: PcItemKind;
  title: string;
  link: string;
  late: boolean;
  since?: string;
  detail?: string | null;
  store?: string | null;
  person?: string | null;
  personId?: string | null;
  tags?: { label: string; variant: StatusVariant }[];
}

export interface PcFilter {
  key: string;
  label: string;
  test: (item: PcListItem) => boolean;
}

const KIND_LOOK: Record<PcItemKind, { label: string; icon: LucideIcon; tile: string }> = {
  ticket: { label: 'Ticket', icon: TicketCheck, tile: 'bg-coral-500/10 text-coral-600 dark:text-coral-300' },
  delegation: { label: 'Delegation', icon: ClipboardList, tile: 'bg-vivid-sky/10 text-vivid-sky-text' },
  checklist: { label: 'Checklist', icon: ClipboardCheck, tile: 'bg-primary-500/10 text-primary-600 dark:text-primary-300' },
  leave: { label: 'Leave', icon: CalendarOff, tile: 'bg-vivid-green/10 text-vivid-green-text' },
};

const ROW_CLASS = 'flex items-stretch gap-1 rounded-lg border bg-surface transition-colors duration-150 hover:border-border-hover';

interface PcRowProps {
  item: PcListItem;
  now: number;
  onOpen: (link: string) => void;
  onOpenPerson: (userId: string) => void;
}

const PcRow = ({ item, now, onOpen, onOpenPerson }: PcRowProps) => {
  const look = KIND_LOOK[item.kind];
  const Icon = look.icon;
  return (
    <li className={cn(ROW_CLASS, item.late ? 'border-vivid-red/40' : 'border-border/60')}>
      <button
        type="button"
        onClick={() => onOpen(item.link)}
        className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      >
        <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', look.tile)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="t-card font-display font-semibold leading-snug text-text line-clamp-2">{item.title}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge variant="neutral" icon={false} label={look.label} />
            {item.since && <WaitChip since={item.since} now={now} />}
            {item.tags?.map((tag) => <StatusBadge key={tag.label} variant={tag.variant} icon={false} label={tag.label} />)}
            {item.store && <StoreChip name={item.store} />}
          </span>
          {item.detail && <span className="t-meta text-text-muted line-clamp-2">{item.detail}</span>}
        </span>
        <ChevronRight className="mt-3 size-4 shrink-0 text-text-muted" aria-hidden="true" />
      </button>
      {item.person && (
        item.personId ? (
          <button
            type="button"
            onClick={() => onOpenPerson(item.personId!)}
            aria-label={`Open ${item.person}`}
            className="flex min-h-11 w-16 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-r-lg border-l border-border/60 px-1 py-2 outline-none transition-colors duration-150 hover:bg-surface-hover/60 focus-visible:ring-2 focus-visible:ring-primary-500/40 sm:w-24"
          >
            <Avatar name={item.person} size="sm" />
            <span className="t-meta w-full text-center font-medium text-text-secondary line-clamp-1">{item.person.split(' ')[0]}</span>
          </button>
        ) : (
          <span className="flex w-16 shrink-0 flex-col items-center justify-center gap-1 border-l border-border/60 px-1 py-2 sm:w-24">
            <Avatar name={item.person} size="sm" />
            <span className="t-meta w-full text-center font-medium text-text-muted line-clamp-1">{item.person.split(' ')[0]}</span>
          </span>
        )
      )}
    </li>
  );
};

interface PcListModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon: LucideIcon;
  items: PcListItem[];
  filters?: PcFilter[];
  defaultFilter?: string;
  isLoading?: boolean;
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyTitle: string;
  emptyDescription: string;
  onOpenPerson: (userId: string) => void;
  summary?: ReactNode;
}

export const PcListModal = ({ open, onClose, title, description, icon: Icon, items, filters = [], defaultFilter, isLoading = false, viewAllHref, viewAllLabel = 'View all', emptyTitle, emptyDescription, onOpenPerson, summary }: PcListModalProps) => {
  const navigate = useNavigate();
  const now = useNow();
  const [activeKey, setActiveKey] = useState(defaultFilter ?? 'all');

  const counts = useMemo(() => new Map(filters.map((f) => [f.key, items.filter(f.test).length])), [filters, items]);
  const shown = useMemo(() => {
    const active = filters.find((f) => f.key === activeKey);
    return active ? items.filter(active.test) : items;
  }, [filters, items, activeKey]);

  const open_ = (link: string) => {
    onClose();
    navigate(link, { viewTransition: true });
  };
  const openPerson = (userId: string) => {
    onClose();
    onOpenPerson(userId);
  };
  const visibleFilters = filters.filter((f) => (counts.get(f.key) ?? 0) > 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={
        <div className="flex size-9 items-center justify-center rounded-xl border border-primary-500/20 bg-primary-500/10 text-primary-600 dark:text-primary-400">
          <Icon size={17} strokeWidth={2.5} />
        </div>
      }
      size="md"
      contentClassName="gap-0"
      headerClassName="px-4 py-3"
      bodyClassName="gap-3 px-4 pt-3"
      footerClassName="px-4 pt-3"
      footer={viewAllHref && (
        <Button type="button" variant="outline" size="sm" className="w-full max-sm:h-11" onClick={() => open_(viewAllHref)}>
          {viewAllLabel}
          <ArrowUpRight size={15} strokeWidth={2.5} />
        </Button>
      )}
      draggable
    >
      {(summary || visibleFilters.length > 1) && (
        <div className="flex flex-col gap-2">
          {summary && <div className="flex flex-wrap items-center gap-1.5">{summary}</div>}
          {visibleFilters.length > 1 && (
            <div role="group" aria-label="Filter the list" className="flex flex-wrap gap-1.5">
              <ToggleChip on={activeKey === 'all'} onClick={() => setActiveKey('all')}>All {items.length}</ToggleChip>
              {visibleFilters.map((f) => (
                <ToggleChip key={f.key} on={activeKey === f.key} onClick={() => setActiveKey(f.key)}>{f.label} {counts.get(f.key)}</ToggleChip>
              ))}
            </div>
          )}
        </div>
      )}
      {isLoading ? (
        <div className="flex flex-col gap-2" role="status" aria-label="Loading">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : shown.length === 0 ? (
        <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} tone="success" size="compact" />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((item) => <PcRow key={item.id} item={item} now={now} onOpen={open_} onOpenPerson={openPerson} />)}
        </ul>
      )}
    </Modal>
  );
};

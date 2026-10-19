import { memo } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight, Inbox, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Modal } from '../../components/modal';
import { StatusChip } from '../../components/statusChip';
import { Skeleton } from '../../components/skeleton';
import { EmptyState } from '../../components/emptyState';
import { Button } from '../../components/button';
import { formatRelativeTime } from './dashboardDisplay';

export interface DrilldownRow {
  id: string;
  title: string;
  link: string;
  createdAt: string;
  completed: boolean;
  overdue: boolean;
  meta?: string;
  dueAt?: number | null;
}

const PREVIEW_LIMIT = 8;

interface DrilldownListProps {
  rows: DrilldownRow[];
  total?: number;
  cappedNote?: string;
  isLoading?: boolean;
  viewAllHref?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  onSelect: (link: string) => void;
}

const DrilldownRowButton = memo(({ row, onSelect }: { row: DrilldownRow; onSelect: (link: string) => void }) => {
  const state = row.completed ? 'completed' : row.overdue ? 'overdue' : 'pending';
  return (
    <button
      type="button"
      onClick={() => onSelect(row.link)}
      className="group flex items-center gap-3 min-h-11 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-left transition-colors duration-200 hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
    >
      <div className="flex flex-1 min-w-0 flex-col gap-0.5">
        <p className="text-sm font-display font-semibold text-text line-clamp-2 leading-snug">{row.title}</p>
        <p className={`t-meta font-medium ${row.overdue && !row.completed ? 'text-danger' : 'text-text-muted'}`}>{row.meta ?? formatRelativeTime(row.createdAt)}</p>
      </div>
      <span className="hidden sm:inline-flex shrink-0">
        <StatusChip status={state} />
      </span>
      <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-text-muted" aria-hidden="true" />
    </button>
  );
});
DrilldownRowButton.displayName = 'DrilldownRowButton';

const DrilldownList = ({ rows, total, cappedNote, isLoading = false, viewAllHref, emptyTitle = 'Nothing here yet', emptyDescription = 'No items match this selection.', onSelect }: DrilldownListProps) => {
  const visible = rows.slice(0, PREVIEW_LIMIT);
  const remaining = rows.length - visible.length;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1.5">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[3.25rem] rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <EmptyState size="compact" icon={Inbox} title={emptyTitle} description={emptyDescription} />;
  }

  const counted = total != null && total > visible.length ? total : null;
  const footnote = counted != null
    ? `Showing ${visible.length} of ${counted}.${viewAllHref ? ' The rest are on the full list.' : ''}`
    : [remaining > 0 ? `+${remaining} more` : null, cappedNote ?? null].filter(Boolean).join('. ');

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {visible.map((row) => (
          <DrilldownRowButton key={row.id} row={row} onSelect={onSelect} />
        ))}
      </div>

      {footnote && <p className="t-meta font-medium text-text-muted text-center">{footnote}</p>}
    </>
  );
};

const DrilldownViewAllButton = ({ href, label = 'View all', onSelect }: { href: string; label?: string; onSelect: (link: string) => void }) => (
  <Button size="lg" className="w-full sm:w-auto text-sm" onClick={() => onSelect(href)}>
    {label}
    <ArrowUpRight size={15} strokeWidth={2.5} />
  </Button>
);

interface DrilldownModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  rows: DrilldownRow[];
  total?: number;
  cappedNote?: string;
  isLoading?: boolean;
  viewAllHref?: string;
  viewAllLabel?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}

export const DrilldownModal = ({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  rows,
  total,
  cappedNote,
  isLoading = false,
  viewAllHref,
  viewAllLabel = 'View all',
  emptyTitle,
  emptyDescription,
}: DrilldownModalProps) => {
  const navigate = useNavigate();

  const go = (link: string) => {
    onClose();
    navigate(link, { viewTransition: true });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={
        Icon && (
          <div className="flex items-center justify-center size-9 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400">
            <Icon size={17} strokeWidth={2.5} />
          </div>
        )
      }
      size="md"
      contentClassName="gap-0"
      headerClassName="px-4 py-3"
      bodyClassName="gap-3 px-4 pt-3"
      footerClassName="px-4 pt-3"
      footer={viewAllHref && <DrilldownViewAllButton href={viewAllHref} label={viewAllLabel} onSelect={go} />}
      draggable
    >
      <DrilldownList rows={rows} total={total} cappedNote={cappedNote} isLoading={isLoading} viewAllHref={viewAllHref} emptyTitle={emptyTitle} emptyDescription={emptyDescription} onSelect={go} />
    </Modal>
  );
};

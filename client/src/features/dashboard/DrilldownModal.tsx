import { useNavigate } from 'react-router';
import { ChevronRight, Inbox, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { Modal } from '../../components/modal';
import { formatRelativeTime } from './dashboardDisplay';

export interface DrilldownRow {
  id: string;
  title: string;
  link: string;
  createdAt: string;
  completed: boolean;
  overdue: boolean;
}

interface DrilldownModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  rows: DrilldownRow[];
  /** Preview lists are sometimes capped (e.g. the last 25 checklist instances) — surfaced so the
   *  modal doesn't imply it's showing everything when it isn't. */
  cappedNote?: string;
  /** For a caller whose rows come from an on-open fetch (not already-loaded local data) — shows a
   *  skeleton instead of `rows` briefly rendering as the "Nothing here" empty state before the
   *  real data arrives. */
  isLoading?: boolean;
  viewAllHref: string;
  viewAllLabel?: string;
}

const STATUS_STYLE: Record<'completed' | 'overdue' | 'pending', string> = {
  completed: 'text-success bg-success/10 border-success/20',
  overdue: 'text-danger bg-danger/10 border-danger/20',
  pending: 'text-warning bg-warning/10 border-warning/20',
};

const STATUS_LABEL: Record<'completed' | 'overdue' | 'pending', string> = {
  completed: 'Completed',
  overdue: 'Overdue',
  pending: 'Pending',
};

/**
 * The dashboard's one "tap a stat, see what's behind it" surface — used by the KPI cards, the
 * Activity Overview bar chart's per-bucket breakdown, and the Compliance gauges' per-category
 * breakdown alike, so all three drill-down the same way instead of three bespoke popovers.
 *
 * Deliberately a *preview*, not a replacement for the real list page: it shows up to
 * `PREVIEW_LIMIT` rows plus a "View all" link, rather than trying to be a second Tasks/Tickets
 * page inside a modal.
 */
const PREVIEW_LIMIT = 8;

export const DrilldownModal = ({
  open,
  onClose,
  title,
  description,
  icon: Icon,
  rows,
  cappedNote,
  isLoading = false,
  viewAllHref,
  viewAllLabel = 'View all',
}: DrilldownModalProps) => {
  const navigate = useNavigate();
  const visible = rows.slice(0, PREVIEW_LIMIT);
  const remaining = rows.length - visible.length;

  const go = (link: string) => {
    onClose();
    navigate(link);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={
        Icon && (
          <div className="flex items-center justify-center size-9 rounded-xl bg-primary-50 dark:bg-primary-500/10 border border-primary-100 dark:border-primary-800/50 text-primary-600 dark:text-primary-400">
            <Icon size={17} strokeWidth={2.5} />
          </div>
        )
      }
      size="md"
      bodyClassName="gap-3"
      footer={
        <button
          type="button"
          onClick={() => go(viewAllHref)}
          className="inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-xl bg-primary-600 text-white text-sm font-display font-semibold hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-colors duration-200 cursor-pointer w-full sm:w-auto"
        >
          {viewAllLabel}
          <ArrowUpRight size={15} strokeWidth={2.5} />
        </button>
      }
    >
      {isLoading ? (
        <div className="flex flex-col gap-1.5 -mx-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[3.25rem] rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface-hover/60 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex items-center justify-center size-11 rounded-full bg-surface-hover border border-border/50">
            <Inbox size={18} className="text-text-light" />
          </div>
          <p className="text-sm font-medium text-text-muted max-w-[18rem]">Nothing here for this selection yet.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1.5 -mx-1">
            {visible.map((row) => {
              const state = row.completed ? 'completed' : row.overdue ? 'overdue' : 'pending';
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => go(row.link)}
                  className="group flex items-center gap-3 rounded-xl border border-border/60 dark:border-white/[0.06] bg-surface px-3.5 py-3 text-left transition-colors duration-200 hover:border-primary-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-display font-semibold text-text truncate">{row.title}</p>
                    <p className="text-[11px] font-medium text-text-light mt-0.5">{formatRelativeTime(row.createdAt)}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-display font-bold px-2 py-0.5 rounded-md border ${STATUS_STYLE[state]}`}>
                    {STATUS_LABEL[state]}
                  </span>
                  <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-text-light group-hover:text-primary-500 transition-colors duration-200" />
                </button>
              );
            })}
          </div>

          {(remaining > 0 || cappedNote) && (
            <p className="text-[11px] font-medium text-text-light text-center">
              {remaining > 0 ? `+${remaining} more — ` : ''}
              {cappedNote ?? `See the full list on the ${viewAllLabel.replace(/^View all /i, '').trim() || 'full'} page.`}
            </p>
          )}
        </>
      )}
    </Modal>
  );
};

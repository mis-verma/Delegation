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
}

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

interface DrilldownListProps {
  rows: DrilldownRow[];
  cappedNote?: string;
  isLoading?: boolean;
  viewAllHref?: string;
  viewAllLabel?: string;
  /** Fires with the row's link when a row is tapped — the caller decides what "select" means
   *  (navigate-and-close for a standalone modal, or just navigate when this list already lives
   *  inside a modal the caller manages itself). */
  onSelect: (link: string) => void;
}

const DrilldownRowButton = memo(({ row, onSelect }: { row: DrilldownRow; onSelect: (link: string) => void }) => {
  const state = row.completed ? 'completed' : row.overdue ? 'overdue' : 'pending';
  return (
    <button
      type="button"
      onClick={() => onSelect(row.link)}
      className="group flex items-center gap-3 min-h-11 rounded-xl border border-border/60 bg-surface px-3 py-2.5 text-left transition-colors duration-200 hover:border-primary-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-display font-semibold text-text line-clamp-2 leading-snug">{row.title}</p>
        <p className="text-[11px] font-medium text-text-light mt-0.5">{formatRelativeTime(row.createdAt)}</p>
      </div>
      {/* Same icon-circle-in-a-pill StatusChip every Ticket/Delegation status display already
          renders through. `completed`/`overdue`/`pending` are real StatusChipStatus values, so no
          mapping is needed. */}
      <StatusChip status={state} className="shrink-0" />
      <ChevronRight size={16} strokeWidth={2.5} className="shrink-0 text-text-light group-hover:text-primary-500 transition-colors duration-200" />
    </button>
  );
});
DrilldownRowButton.displayName = 'DrilldownRowButton';

/**
 * The rows/skeleton/empty-state body, with no `Modal`/`Dialog` of its own — split out so a caller
 * that needs to show this content as one *view* inside an already-open modal it's managing (e.g.
 * a breakdown popup that drills from a summary view into an item-list view) can do that without
 * nesting a second `Dialog`. Two stacked Radix dialogs animating open/closed back-to-back is what
 * made that transition feel like a double delay instead of an instant swap.
 */
export const DrilldownList = ({ rows, cappedNote, isLoading = false, viewAllHref, viewAllLabel = 'View all', onSelect }: DrilldownListProps) => {
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
    return <EmptyState size="compact" icon={Inbox} title="Nothing here yet" description="No items match this selection." />;
  }

  const footnote = [
    remaining > 0 ? `+${remaining} more` : null,
    cappedNote ?? (viewAllHref ? `See the full list on the ${viewAllLabel.replace(/^View all /i, '').trim() || 'full'} page.` : null),
  ].filter(Boolean).join('. ');

  return (
    <>
      <div className="flex flex-col gap-1.5">
        {visible.map((row) => (
          <DrilldownRowButton key={row.id} row={row} onSelect={onSelect} />
        ))}
      </div>

      {footnote && <p className="text-[11px] font-medium text-text-light text-center">{footnote}</p>}
    </>
  );
};

/** The "View all X" footer button `DrilldownModal` renders in `Modal`'s `footer` slot — split out
 *  so a caller building its own single-Modal multi-view flow (see `DrilldownList`'s own doc
 *  comment) can put the same button in its own footer. */
export const DrilldownViewAllButton = ({ href, label = 'View all', onSelect }: { href: string; label?: string; onSelect: (link: string) => void }) => (
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
  /** Preview lists are sometimes capped (e.g. the last 25 records) — surfaced so the modal doesn't
   *  imply it's showing everything when it isn't. */
  cappedNote?: string;
  /** For a caller whose rows come from an on-open fetch (not already-loaded local data) — shows a
   *  skeleton instead of `rows` briefly rendering as the "Nothing here" empty state before the
   *  real data arrives. */
  isLoading?: boolean;
  /** Omit when the caller has nowhere to send "view all" for the current viewer (e.g. the
   *  destination page is gated to a role narrower than whoever can open this modal) — the footer
   *  button and its "see the full list" copy just don't render, leaving the row-level links (which
   *  go somewhere every viewer can reach) as the only way out of the modal. */
  viewAllHref?: string;
  viewAllLabel?: string;
}

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
          <div className="flex items-center justify-center size-9 rounded-xl bg-primary-500/10 border border-primary-500/20 text-primary-600 dark:text-primary-400">
            <Icon size={17} strokeWidth={2.5} />
          </div>
        )
      }
      size="md"
      // Tighter than Modal's own default px-5/py-4 (20px/16px) — a plain list of rows doesn't
      // need as much breathing room as a form does, and the rows below already carry their own
      // padding. Scoped to just this modal, not the shared Modal default every form dialog in the
      // app still uses.
      headerClassName="px-4 py-3"
      bodyClassName="gap-3 px-4 py-3"
      footerClassName="px-4 py-3"
      footer={viewAllHref && <DrilldownViewAllButton href={viewAllHref} label={viewAllLabel} onSelect={go} />}
      // The one modal every KPI card, chart bucket, and gauge on the dashboard opens through — it
      // sits on top of the exact number it's explaining, so being able to drag it a little aside
      // to compare the preview list against the chart underneath is worth more here than on a
      // one-shot form dialog with nothing behind it worth uncovering.
      draggable
    >
      <DrilldownList rows={rows} cappedNote={cappedNote} isLoading={isLoading} viewAllHref={viewAllHref} viewAllLabel={viewAllLabel} onSelect={go} />
    </Modal>
  );
};

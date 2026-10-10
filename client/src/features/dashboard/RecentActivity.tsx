import { memo, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import {
  Ticket as TicketIcon,
  CheckSquare,
  CircleDot,
  ShieldCheck,
  PauseCircle,
  CheckCircle2,
  Clock,
  Activity,
  Search,
  ArrowUpDown,
  ChevronRight,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Skeleton, PageNav, EntityIconTile, Button, StatusChip, IconChip, Input, EmptyState, InlineError, type StatusChipStatus } from '../../components';
import { useNow } from '../../lib/useNow';
import { formatRelativeTime, DASHBOARD_CARD_CLASS, ACTIVITY_CATEGORY_DOT_CLASS, type FeedItem } from './dashboardDisplay';
import { STATUS_ICON as TASK_STATUS_ICON, STATUS_CONFIG as TASK_STATUS_CONFIG } from '../tasks/taskDisplay';
import { STATUS_CONFIG as TICKET_STATUS_CONFIG } from '../tickets/ticketDisplay';
import type { TicketStatus } from '../../api/ticket';
import type { Task } from '../../api/task';

interface RecentActivityProps {
  feed: FeedItem[];
  isPending: boolean;
  /** The feed could not load. Shown as an inline error with Retry instead of an empty feed, which
   *  would read as "nothing has been raised". Rows that did load still render. */
  isError?: boolean;
  onRetry?: () => void;
  /** Just the list: no search box or sort button. */
  simple?: boolean;
}

type SortOrder = 'newest' | 'oldest';

const PAGE_SIZE = 5;
const FRESH_WINDOW_MS = 5 * 60_000;

/**
 * How many items HomePage should hand this card. Lives here, next to `PAGE_SIZE`, because the two
 * have to divide sensibly: the feed used to be capped at 6 against a page size of 5, so page two
 * always held exactly one row.
 */
export const RECENT_ACTIVITY_FEED_SIZE = 25;

/**
 * This card shows relative times ("3m ago") and a "fresh" ping on anything under 5 minutes old,
 * and neither advances on a dashboard left open, the normal case for this page. One low-frequency
 * tick (useNow) re-renders the rows so both stay honest without being chatty.
 */
const CLOCK_REFRESH_MS = 30_000;

// Tickets don't have a taskDisplay-style STATUS_ICON map of their own — built here from the same
// dot-color semantics STATUS_CONFIG already assigns per status, so a ticket's icon tone always
// agrees with its status pill instead of a flat "all tickets are primary-colored" icon.
const TICKET_STATUS_ICON: Record<TicketStatus, ReactNode> = {
  OPEN: <CircleDot size={16} className="text-text-muted shrink-0" strokeWidth={2.5} />,
  IN_PROGRESS: <Clock size={16} className="text-warning shrink-0" strokeWidth={2.5} />,
  PENDING_APPROVAL: <ShieldCheck size={16} className="text-status-approve shrink-0" strokeWidth={2.5} />,
  CLOSED: <CheckCircle2 size={16} className="text-success shrink-0" strokeWidth={2.5} />,
  ON_HOLD: <PauseCircle size={16} className="text-text-muted shrink-0" strokeWidth={2.5} />,
};

const TICKET_ICON_TONE: Record<TicketStatus, string> = {
  OPEN: 'bg-surface-hover border-border/50',
  IN_PROGRESS: 'bg-warning/10 border-warning/20',
  PENDING_APPROVAL: 'bg-status-approve/10 border-status-approve/20',
  CLOSED: 'bg-success/10 border-success/20',
  ON_HOLD: 'bg-surface-hover border-border/40',
};

// Status as the app's icon chip (solid icon circle + label), same chip the list pages use.
const TASK_CHIP_KEY: Record<Task['status'], StatusChipStatus> = {
  draft: 'open',
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending_approval',
  done: 'completed',
  on_hold: 'on_hold',
};

interface FeedRowProps {
  item: FeedItem;
  /** Current time in ms (useNow), so the "just now" ping and relative label stay accurate. */
  now: number;
}

// Memoised: the card re-renders on every clock tick and every keystroke in the search box, but a
// row only needs to redraw when its own item (or the clock) changes.
const FeedRow = memo(({ item, now }: FeedRowProps) => {
  const isTicket = item.kind === 'ticket';
  const isFresh = now - new Date(item.createdAt).getTime() < FRESH_WINDOW_MS;
  const KindIcon = isTicket ? TicketIcon : CheckSquare;
  const statusIcon = isTicket ? TICKET_STATUS_ICON[item.status as TicketStatus] : TASK_STATUS_ICON[item.status as Task['status']];
  const iconToneClass = isTicket ? TICKET_ICON_TONE[item.status as TicketStatus] : TASK_STATUS_CONFIG[item.status as Task['status']].badge;
  const pillLabel = isTicket ? TICKET_STATUS_CONFIG[item.status as TicketStatus].label : TASK_STATUS_CONFIG[item.status as Task['status']].label;
  const chipKey: StatusChipStatus = isTicket ? (item.status.toLowerCase() as StatusChipStatus) : TASK_CHIP_KEY[item.status as Task['status']];
  const relative = formatRelativeTime(item.createdAt);

  return (
    <Link
      viewTransition
      // `?open=<id>` opens this exact item's detail sheet instead of dropping you on an unfiltered
      // list to go find the thing you just clicked.
      to={isTicket ? `/tickets?open=${item.id}` : `/tasks?open=${item.id}`}
      aria-label={`${item.title}, ${isTicket ? 'ticket' : 'delegation'}, ${pillLabel}, ${relative}`}
      className="group/row flex items-center justify-between gap-3 sm:gap-0 min-h-11 px-3 sm:px-5 py-2.5 sm:py-3.5 rounded-xl sm:rounded-none border border-border/60 sm:border-0 bg-surface sm:bg-transparent hover:bg-surface-hover/80 active:bg-surface-hover transition-colors duration-200 relative overflow-hidden focus:outline-none focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
    >
      <div aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500 transform -translate-x-full group-hover/row:translate-x-0 transition-transform duration-300 ease-out" />

      <div className="flex flex-1 items-center gap-3 sm:gap-4 min-w-0">
        {/* Icon reflects the item's actual status, not just its kind, so color carries real
            meaning. Decorative: the status chip already states the same status as text. */}
        <div aria-hidden="true" className={`relative hidden sm:flex items-center justify-center size-10 rounded-xl shrink-0 border ${iconToneClass}`}>
          {statusIcon}
          {isFresh && (
            <span className="absolute -top-1 -right-1 flex size-2.5">
              <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-primary-500 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-primary-500 ring-2 ring-surface" />
            </span>
          )}
        </div>

        {/* overflow-hidden on the column (not just min-w-0): min-w-0 lets it shrink but doesn't stop
            its own children rendering wider than it and bleeding into the status chip's space. */}
        <div className="flex flex-col gap-1 min-w-0 overflow-hidden">
          <span className="text-sm sm:text-sm font-display font-semibold sm:font-bold text-text line-clamp-2 leading-snug group-hover/row:text-primary-600 dark:group-hover/row:text-primary-400 transition-colors duration-200">
            {item.title}
          </span>
          {/* On phones the status rides in this row as a chip beside the kind chip (flex-wrap for
              the long labels); a pill on the right had no room next to the title. */}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-medium text-text-muted">
            <IconChip
              icon={KindIcon}
              tone={ACTIVITY_CATEGORY_DOT_CLASS[isTicket ? 'ticket' : 'delegation']}
              label={isTicket ? 'Ticket' : 'Delegation'}
            />
            <StatusChip status={chipKey} label={pillLabel} className="sm:hidden" />
            <span className="hidden sm:block size-1 rounded-full bg-border shrink-0" />
            <span className="hidden sm:inline tabular-nums">{relative}</span>
          </div>
        </div>
      </div>

      {/* Phones: the time sits top-right, mail-app style. */}
      <span className="sm:hidden self-start shrink-0 pt-0.5 text-xs font-medium text-text-muted tabular-nums">{relative}</span>

      <div className="hidden sm:flex items-center gap-4 shrink-0 ml-4">
        <StatusChip status={chipKey} label={pillLabel} />
        <ChevronRight
          size={16}
          aria-hidden="true"
          className="text-text-muted/40 transform -translate-x-2 opacity-0 group-hover/row:translate-x-0 group-hover/row:opacity-100 group-hover/row:text-primary-500 transition-all duration-300"
        />
      </div>
    </Link>
  );
});
FeedRow.displayName = 'FeedRow';

const FeedSkeleton = () => (
  <div className="flex flex-col divide-y divide-border/30" role="status" aria-label="Loading recent items">
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Skeleton className="size-10 rounded-xl shrink-0 hidden sm:block" />
          <div className="flex flex-col gap-2 w-full max-w-sm">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-6 w-20 rounded-full shrink-0" />
      </div>
    ))}
  </div>
);

export const RecentActivity = ({ feed, isPending, isError = false, onRetry, simple = false }: RecentActivityProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [page, setPage] = useState(1);
  const [pagedFor, setPagedFor] = useState({ query, sort });
  const now = useNow(CLOCK_REFRESH_MS);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = needle ? feed.filter((item) => item.title.toLowerCase().includes(needle)) : feed;
    return [...filtered].sort((a, b) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sort === 'newest' ? -diff : diff;
    });
  }, [feed, query, sort]);

  if (pagedFor.query !== query || pagedFor.sort !== sort) {
    setPagedFor({ query, sort });
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const paged = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <section id="recent-activity" aria-labelledby="recent-activity-heading" className={`@container relative ${DASHBOARD_CARD_CLASS} flex flex-col hover:border-primary-500/30 transition-colors duration-200 overflow-hidden`}>
      {/* Title and search share a row only when the card itself is wide (@2xl); in the half-width
          desktop slot the search drops under the title instead of squeezing the heading. */}
      <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3 @2xl:gap-4 px-3 sm:px-5 py-2.5 sm:py-4 border-b border-border/40">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <EntityIconTile icon={Activity} className="size-7 sm:size-10" iconClassName="size-3.5 sm:size-5" />
          <div>
            <h2 id="recent-activity-heading" className="t-section font-display font-bold text-text tracking-tight">
              Recently created
            </h2>
            <p className="hidden sm:block text-xs font-medium text-text-muted mt-0.5">Newest tickets and delegations</p>
          </div>
        </div>

        {/* Search and sort are desktop-only: a five-row feed on a phone is read top to bottom, not
            queried; each module's own page has real search. */}
        <div className={simple ? 'hidden' : 'hidden sm:flex items-center gap-2 sm:shrink-0'}>
          <Input
            id="recent-activity-search"
            type="search"
            aria-label="Search recently created items"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title"
            containerClassName="flex-1 min-w-0 @2xl:flex-none @2xl:w-52"
            className="h-9 rounded-xl text-xs"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
            aria-label={`Sort by ${sort === 'newest' ? 'oldest' : 'newest'} first`}
            className="h-9 rounded-xl shrink-0"
          >
            <ArrowUpDown size={14} aria-hidden="true" className="text-text-muted" />
            {sort === 'newest' ? 'Newest' : 'Oldest'}
          </Button>
        </div>
      </div>

      {/* min-h only from `sm:` up: that height keeps this card from looking visibly shorter than
          whatever shares its row in the 2-column desktop grid; stacked full-width on mobile it has
          no neighbour to match. */}
      <div className="flex flex-col sm:min-h-[280px]">
        {isError && (
          <div className="p-3 sm:p-4">
            <InlineError message="Couldn't load recent tickets and delegations." onRetry={onRetry} />
          </div>
        )}

        {isPending ? (
          <FeedSkeleton />
        ) : feed.length === 0 ? (
          isError ? null : (
            <div className="flex flex-1 flex-col p-3 sm:p-4">
              <EmptyState
                className="flex-1"
                icon={Sparkles}
                title="Nothing raised yet"
                description="New tickets and delegations will show up here."
                action={{ label: 'New ticket', icon: Plus, onClick: () => navigate('/tickets?create=1', { viewTransition: true }) }}
              />
            </div>
          )
        ) : visible.length === 0 ? (
          <div className="flex flex-1 flex-col p-3 sm:p-4">
            <EmptyState className="flex-1" size="compact" icon={Search} title="No matches" description={`Nothing here matches "${query}".`} />
          </div>
        ) : (
          // Phones: separate bordered list cards with a gap (same row language as Needs your
          // approval above it); from `sm` up, the flush divided list.
          <div className="flex flex-col gap-2 p-3 sm:p-0 sm:gap-0 sm:divide-y divide-border/40">
            {paged.map((item) => (
              <FeedRow key={`${item.kind}-${item.id}`} item={item} now={now} />
            ))}
          </div>
        )}
      </div>

      {!isPending && visible.length > 0 && totalPages > 1 && (
        <div className="flex flex-col @2xl:flex-row @2xl:items-center @2xl:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border/50">
          <span className="text-xs font-medium text-text-muted tabular-nums whitespace-nowrap order-2 @2xl:order-1 @max-2xl:self-center">
            Showing {(page - 1) * PAGE_SIZE + 1} to {Math.min(page * PAGE_SIZE, visible.length)} of {visible.length}
          </span>
          <div className="order-1 @2xl:order-2 flex justify-center">
            <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}
    </section>
  );
};

import { memo, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Ticket as TicketIcon, CheckSquare, Activity, Search, ArrowUpDown, ChevronRight, Plus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton, PageNav, Button, StatusChip, IconChip, Input, EmptyState, InlineError, type StatusChipStatus } from '../../components';
import { useNow } from '../../lib/useNow';
import { pastDayLabel, DASHBOARD_CARD_CLASS, ACTIVITY_CATEGORY_DOT_CLASS, cardIconTile, type FeedItem } from './dashboardDisplay';
import { STATUS_CONFIG as TASK_STATUS_CONFIG } from '../tasks/taskDisplay';
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
  /** Front-line staff: just the list, no search box or sort button, and at most three rows on a
   *  phone (the "things need you" list above already shows their own work). */
  simple?: boolean;
}

type SortOrder = 'newest' | 'oldest';

const PAGE_SIZE = 5;
// Front-line phones: the first three rows only.
const SIMPLE_PHONE_ROWS = 3;

/**
 * How many items HomePage should hand this card. Lives here, next to `PAGE_SIZE`, because the two
 * have to divide sensibly: the feed used to be capped at 6 against a page size of 5, so page two
 * always held exactly one row.
 */
export const RECENT_ACTIVITY_FEED_SIZE = 25;

/**
 * This card shows relative times ("3 min ago"), which don't advance on a dashboard left open, the
 * normal case for this page. One low-frequency tick (useNow) re-renders the rows so they stay honest
 * without being chatty.
 */
const CLOCK_REFRESH_MS = 30_000;

// Status as the app's icon chip (solid icon circle + label), same chip the list pages use.
const TASK_CHIP_KEY: Record<Task['status'], StatusChipStatus> = {
  draft: 'open',
  todo: 'open',
  in_progress: 'in_progress',
  pending_approval: 'pending_approval',
  done: 'completed',
  on_hold: 'on_hold',
};

// The dashboard's list row, shared in shape with Upcoming events: a plain divided row, title up to two
// lines, small chips under it, the date on the right. Hover is a neutral wash only, so nothing stays
// coloured after a tap on a phone.
const ROW_CLASS =
  'flex items-center gap-3 min-h-14 px-4 sm:px-5 py-3 outline-none transition-colors duration-150 hover:bg-surface-hover/50 active:bg-surface-hover focus-visible:bg-surface-hover';

interface FeedRowProps {
  item: FeedItem;
  /** Current time in ms (useNow), so the relative label stays accurate. */
  now: number;
  className?: string;
}

// Memoised: the card re-renders on every clock tick and every keystroke in the search box, but a
// row only needs to redraw when its own item (or the clock) changes.
const FeedRow = memo(({ item, now, className }: FeedRowProps) => {
  const isTicket = item.kind === 'ticket';
  const KindIcon = isTicket ? TicketIcon : CheckSquare;
  const pillLabel = isTicket ? TICKET_STATUS_CONFIG[item.status as TicketStatus].label : TASK_STATUS_CONFIG[item.status as Task['status']].label;
  const chipKey: StatusChipStatus = isTicket ? (item.status.toLowerCase() as StatusChipStatus) : TASK_CHIP_KEY[item.status as Task['status']];
  const relative = pastDayLabel(item.createdAt, now);

  return (
    <Link
      viewTransition
      // `?open=<id>` opens this exact item's detail sheet instead of dropping you on an unfiltered
      // list to go find the thing you just clicked.
      to={isTicket ? `/tickets?open=${item.id}` : `/tasks?open=${item.id}`}
      aria-label={`${item.title}, ${isTicket ? 'ticket' : 'delegation'}, ${pillLabel}, ${relative}`}
      className={cn(ROW_CLASS, className)}
    >
      <div className="flex flex-1 min-w-0 flex-col gap-1">
        <span className="line-clamp-2 leading-snug text-sm font-display font-medium sm:font-semibold text-text">{item.title}</span>
        {/* The status keeps its word at every size (several statuses share one grey icon); the kind
            is an icon alone on a phone, since the icon already says ticket or delegation. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <IconChip
            icon={KindIcon}
            tone={ACTIVITY_CATEGORY_DOT_CLASS[isTicket ? 'ticket' : 'delegation']}
            label={isTicket ? 'Ticket' : 'Delegation'}
            iconOnlyOnMobile
          />
          <StatusChip status={chipKey} label={pillLabel} showLabelOnMobile />
        </div>
      </div>
      <span className="self-start shrink-0 pt-0.5 t-meta font-medium text-text-muted tabular-nums">{relative}</span>
    </Link>
  );
});
FeedRow.displayName = 'FeedRow';

const FeedSkeleton = ({ simple }: { simple: boolean }) => (
  <div className="flex flex-col divide-y divide-border/60" role="status" aria-label="Loading recent items">
    {Array.from({ length: PAGE_SIZE }).map((_, i) => (
      <div key={i} className={cn('flex min-h-14 items-start gap-3 px-4 sm:px-5 py-3', simple && i >= SIMPLE_PHONE_ROWS && 'max-sm:hidden')}>
        <div className="flex flex-1 min-w-0 flex-col gap-1.5">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex items-center gap-1.5">
            <Skeleton className="size-6 sm:h-7 sm:w-24 rounded-full" />
            <Skeleton className="h-6 sm:h-7 w-24 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-3.5 w-14 shrink-0" />
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
  const createTicket = () => navigate('/tickets?create=1', { viewTransition: true });

  return (
    <section id="recent-activity" aria-labelledby="recent-activity-heading" className={`@container relative ${DASHBOARD_CARD_CLASS} flex flex-col overflow-hidden`}>
      {/* Title and search share a row only when the card itself is wide (@2xl); in the half-width
          desktop slot the search drops under the title instead of squeezing the heading. */}
      <div className="flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3 @2xl:gap-4 px-4 sm:px-5 py-3 sm:py-4 border-b border-border/40">
        <div className="flex items-center gap-3 min-w-0">
          <div className={cardIconTile('info')}>
            <Activity className="size-4" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="recent-activity-heading" className="t-section font-display font-bold text-text tracking-tight">
              Recently created
            </h2>
            <p className="hidden sm:block t-meta font-medium text-text-muted">Newest tickets and delegations</p>
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
          <div className="px-4 py-3 sm:px-5">
            <InlineError message="Couldn't load recent tickets and delegations." onRetry={onRetry} />
          </div>
        )}

        {isPending ? (
          <FeedSkeleton simple={simple} />
        ) : feed.length === 0 ? (
          isError ? null : (
            <div className="flex flex-1 flex-col p-4 sm:p-5">
              {/* Compact on a phone, the full empty state with its action from sm up. */}
              <div className="sm:hidden">
                <EmptyState size="compact" icon={Sparkles} title="Nothing raised yet" description="New tickets and delegations will show up here." />
              </div>
              <div className="hidden sm:flex flex-1 flex-col">
                <EmptyState
                  className="flex-1"
                  icon={Sparkles}
                  title="Nothing raised yet"
                  description="New tickets and delegations will show up here."
                  action={{ label: 'New ticket', icon: Plus, onClick: createTicket }}
                />
              </div>
            </div>
          )
        ) : visible.length === 0 ? (
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <EmptyState className="flex-1" size="compact" icon={Search} title="No matches" description={`Nothing here matches "${query}".`} />
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {paged.map((item, i) => (
              <FeedRow key={`${item.kind}-${item.id}`} item={item} now={now} className={simple && i >= SIMPLE_PHONE_ROWS ? 'max-sm:hidden' : undefined} />
            ))}
          </div>
        )}
      </div>

      {/* Phones: no pages, just the first rows and a way to the full lists. */}
      {!isPending && feed.length > 0 && (
        <div className="sm:hidden grid grid-cols-2 gap-2 border-t border-border/60 px-2 py-1">
          {[{ to: '/tasks', label: 'All delegations' }, { to: '/tickets', label: 'All tickets' }].map((link) => (
            <Link
              key={link.to}
              viewTransition
              to={link.to}
              className="inline-flex min-h-11 items-center justify-center gap-0.5 rounded-lg px-2 text-sm font-display font-semibold text-primary-600 dark:text-primary-400 transition-colors active:bg-surface-hover"
            >
              {link.label}
              <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ))}
        </div>
      )}

      {!isPending && visible.length > 0 && totalPages > 1 && (
        <div className="hidden sm:flex flex-col @2xl:flex-row @2xl:items-center @2xl:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border/50">
          <span className="t-meta font-medium text-text-muted tabular-nums whitespace-nowrap order-2 @2xl:order-1 @max-2xl:self-center">
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

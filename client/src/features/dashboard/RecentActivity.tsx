import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  type LucideIcon,
  Sparkles
} from 'lucide-react';
import { Skeleton, PageNav, EntityIconTile, Button } from '../../components';
import { formatRelativeTime, DASHBOARD_CARD_CLASS, ACTIVITY_CATEGORY_DOT_CLASS, type FeedItem } from './dashboardDisplay';
import { STATUS_ICON as TASK_STATUS_ICON, STATUS_CONFIG as TASK_STATUS_CONFIG } from '../tasks/taskDisplay';
import { STATUS_CONFIG as TICKET_STATUS_CONFIG } from '../tickets/ticketDisplay';
import type { TicketStatus } from '../../api/ticket';
import type { Task } from '../../api/task';

interface RecentActivityProps {
  feed: FeedItem[];
  isPending: boolean;
}

type SortOrder = 'newest' | 'oldest';

const PAGE_SIZE = 5;
const FRESH_WINDOW_MS = 5 * 60_000;

/**
 * How many items HomePage should hand this card. Lives here, next to `PAGE_SIZE`, because the two
 * have to divide sensibly — the feed used to be capped at 6 against a page size of 5, so page two
 * always held exactly one row.
 */
export const RECENT_ACTIVITY_FEED_SIZE = 25;

/**
 * This card shows relative times ("3m ago") and a "fresh" ping on anything under 5 minutes old,
 * and neither used to advance on a dashboard left open — the normal case for this page. `isFresh`
 * was measured against a single mount-time `Date.now()`, so the ping never stopped pulsing;
 * `formatRelativeTime` reads the clock itself but nothing was triggering a re-render, so it sat at
 * whatever it said on arrival. One low-frequency tick fixes both without being chatty.
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

// taskDisplay's STATUS_CONFIG only exposes a translucent `indicator` (meant for board-card dots);
// the status pill's glow dot below wants the solid tone, matching TICKET_STATUS_CONFIG's `dot`.
const TASK_DOT: Record<Task['status'], string> = {
  draft: 'bg-text-light',
  todo: 'bg-status-todo',
  in_progress: 'bg-status-progress',
  pending_approval: 'bg-status-approve',
  done: 'bg-status-done',
};

/**
 * "Nothing here at all" and "nothing matched your search" were two near-identical blocks differing
 * only in copy, icon and one decorative glow. `tinted` marks the encouraging case (an empty feed is
 * a prompt to create something); a fruitless search gets the plainer treatment.
 */
const ActivityEmptyState = ({
  icon: Icon,
  title,
  detail,
  tinted,
  action,
}: {
  icon: LucideIcon;
  title: string;
  detail: ReactNode;
  tinted: boolean;
  action?: { label: string; onClick: () => void };
}) => (
  <div className="flex flex-col items-center justify-center flex-1 py-12 text-center gap-4 animate-in fade-in duration-500">
    <div className="relative p-4 rounded-2xl bg-surface-hover border border-border/50">
      {tinted && <div className="absolute inset-0 bg-primary-500/10 blur-xl rounded-full" />}
      <Icon size={24} className={`relative z-10 ${tinted ? 'text-primary-500/70' : 'text-text-muted/50'}`} />
    </div>
    <div className="flex flex-col gap-1">
      <p className="text-sm font-display font-semibold text-text">{title}</p>
      <p className="text-xs font-medium text-text-muted max-w-[220px] mx-auto">{detail}</p>
    </div>
    {action && (
      <Button size="sm" className="rounded-full" onClick={action.onClick}>
        <Plus size={13} strokeWidth={2.75} />
        {action.label}
      </Button>
    )}
  </div>
);

export const RecentActivity = ({ feed, isPending }: RecentActivityProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortOrder>('newest');
  const [page, setPage] = useState(1);
  const [pagedFor, setPagedFor] = useState({ query, sort });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_REFRESH_MS);
    return () => clearInterval(id);
  }, []);

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
    // Opaque `bg-surface` and the same `dark:border-white/[0.06]` every other card uses — this was
    // one of three different card backgrounds in play on one page (bg-surface, bg-surface/80,
    // none), and one of three cards missing the dark-mode border override, so in dark mode
    // adjacent cards drew visibly different border weights. The ambient glows below are children,
    // so they still read through on top of the opaque surface.
    <section id="recent-activity" aria-labelledby="recent-activity-heading" className={`relative group ${DASHBOARD_CARD_CLASS} flex flex-col hover:border-primary-500/30 transition-colors duration-500 overflow-hidden`}>
      
      {/* Ambient Decorative Glows */}
      <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary-500/10 rounded-full blur-[80px] pointer-events-none transition-opacity duration-700 opacity-40 group-hover:opacity-100" />
      <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-primary-400/5 rounded-full blur-[80px] pointer-events-none transition-opacity duration-700 opacity-40 group-hover:opacity-100" />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 px-4 sm:px-5 py-3 sm:py-4 border-b border-border/40 bg-surface/50 backdrop-blur-xl">
        <div className="flex items-center gap-3.5">
          <EntityIconTile icon={Activity} />
          <div>
            <h2 id="recent-activity-heading" className="text-base sm:text-lg font-display font-bold text-text tracking-tight flex items-center gap-2">
              Recent Activity
            </h2>
            <p className="text-[11px] sm:text-xs font-medium text-text-muted mt-0.5">
              Latest updates on tickets and delegations
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          {/* flex-1 on mobile, not a fixed w-32 — this row is on its own line below the title on
              mobile (the header is flex-col there), so it has the full card width to itself with
              nothing to compete with. The old fixed 128px was narrow enough to clip the
              placeholder itself ("Search activit…"). Reverts to a fixed width at `sm`, where this
              row sits beside the title and does need to stay compact. */}
          <div className="relative group/search flex-1 min-w-0 sm:flex-none">
            <label htmlFor="recent-activity-search" className="sr-only">Search activity</label>
            <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted transition-colors group-focus-within/search:text-primary-500" />
            <input
              id="recent-activity-search"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activity..."
              className="h-9 w-full sm:w-48 pl-8 pr-3 rounded-xl border border-border/60 bg-surface-hover/50 text-xs font-medium text-text placeholder:text-text-muted/70 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500/50 focus:bg-surface sm:focus:w-56"
            />
          </div>
          <button
            type="button"
            onClick={() => setSort((s) => (s === 'newest' ? 'oldest' : 'newest'))}
            title="Toggle sort order"
            aria-label={`Sort by ${sort === 'newest' ? 'oldest' : 'newest'} first`}
            className="flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl border border-border/60 bg-surface-hover/50 hover:bg-surface-hover hover:border-border text-xs font-display font-semibold text-text-secondary transition-all duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ArrowUpDown size={14} aria-hidden="true" className="text-text-muted" />
            <span className="hidden sm:inline">{sort === 'newest' ? 'Newest' : 'Oldest'}</span>
          </button>
        </div>
      </div>

      {/* List Content */}
      <div className="relative z-10 flex flex-col min-h-[280px]">
        {isPending ? (
          <div className="flex flex-col divide-y divide-border/30">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 sm:px-5 py-4">
                <div className="flex items-center gap-4 w-full">
                  <Skeleton className="size-10 rounded-xl shrink-0 opacity-70" />
                  <div className="flex flex-col gap-2 w-full max-w-sm">
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/3 rounded opacity-60" />
                  </div>
                </div>
                <Skeleton className="h-6 w-20 rounded-full shrink-0" />
              </div>
            ))}
          </div>
        ) : feed.length === 0 ? (
          <ActivityEmptyState
            icon={Sparkles}
            tinted
            title="Quiet around here"
            detail="Nothing's been raised yet"
            action={{ label: 'New ticket', onClick: () => navigate('/tickets?create=1') }}
          />
        ) : visible.length === 0 ? (
          <ActivityEmptyState
            icon={Search}
            tinted={false}
            title="No matches found"
            detail={<>Nothing here matches &ldquo;{query}&rdquo;.</>}
          />
        ) : (
          <div className="flex flex-col divide-y divide-border/40">
            {paged.map((item) => {
              const isTicket = item.kind === 'ticket';
              const isFresh = now - new Date(item.createdAt).getTime() < FRESH_WINDOW_MS;
              const KindIcon = isTicket ? TicketIcon : CheckSquare;
              const statusIcon = isTicket ? TICKET_STATUS_ICON[item.status as TicketStatus] : TASK_STATUS_ICON[item.status as Task['status']];
              const iconToneClass = isTicket ? TICKET_ICON_TONE[item.status as TicketStatus] : TASK_STATUS_CONFIG[item.status as Task['status']].badge;
              const pillClassName = isTicket ? TICKET_STATUS_CONFIG[item.status as TicketStatus].className : TASK_STATUS_CONFIG[item.status as Task['status']].badge;
              const pillLabel = isTicket ? TICKET_STATUS_CONFIG[item.status as TicketStatus].label : TASK_STATUS_CONFIG[item.status as Task['status']].label;
              // Same glowing-dot treatment already used for ticket board column headers — a soft
              // blurred halo behind a solid dot reads as a deliberate status indicator instead of
              // a flat tinted pill, which is what made "Pending Verification" look washed out.
              const dotClassName = isTicket ? TICKET_STATUS_CONFIG[item.status as TicketStatus].dot : TASK_DOT[item.status as Task['status']];

              return (
                <Link
                  key={`${item.kind}-${item.id}`}
                  // `?open=<id>` opens this exact item's detail sheet. These rows used to link to
                  // the bare list page, so clicking a named item dropped you on an unfiltered
                  // table to go find the thing you'd just clicked.
                  to={isTicket ? `/tickets?open=${item.id}` : `/tasks?open=${item.id}`}
                  aria-label={`${item.title} — ${isTicket ? 'ticket' : 'delegation'}, ${pillLabel}, ${formatRelativeTime(item.createdAt)}`}
                  // flex-col below `sm` — side-by-side (icon+title left, status badge right) only
                  // works once the badge has room to spare; on a phone the longest pill label
                  // ("Pending Approval") left so little width for title+meta that the meta row
                  // (icon-chip + timestamp) had nowhere to go but overflow under the badge. Full
                  // width for the badge on its own line removes the squeeze instead of clipping it.
                  className="group/row flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 px-4 sm:px-5 py-2.5 sm:py-3.5 hover:bg-surface-hover/80 transition-all duration-300 relative overflow-hidden focus:outline-none focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
                >
                  {/* Animated Left Accent Line */}
                  <div aria-hidden="true" className="absolute left-0 top-0 bottom-0 w-1 bg-primary-500 transform -translate-x-full group-hover/row:translate-x-0 transition-transform duration-300 ease-out" />

                  <div className="flex items-center gap-4 min-w-0">
                    {/* Icon reflects the item's actual status, not just its kind, so color carries real meaning.
                        Decorative: the status pill on the right already states the same status as text. */}
                    <div aria-hidden="true" className={`relative flex items-center justify-center size-9 sm:size-10 rounded-xl shrink-0 border transition-colors duration-300 ${iconToneClass}`}>
                      {statusIcon}
                      {isFresh && (
                        <span className="absolute -top-1 -right-1 flex size-2.5">
                          <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-primary-500 opacity-75" />
                          <span className="relative inline-flex size-2.5 rounded-full bg-primary-500 ring-2 ring-surface" />
                        </span>
                      )}
                    </div>

                    {/* Title & Metadata. overflow-hidden on the column (not just min-w-0 on it) —
                        min-w-0 lets the column shrink but doesn't stop its own children from
                        rendering wider than it and bleeding into the status badge's space, which
                        is exactly what the meta row below did whenever the badge text was long
                        ("Pending Approval") and the title short: the meta row overflowed sideways
                        and the badge — painted after it in DOM order — sat visually on top of it. */}
                    <div className="flex flex-col gap-1 min-w-0 overflow-hidden">
                      <span className="text-[13px] font-display font-bold text-text line-clamp-2 leading-snug group-hover/row:text-primary-600 dark:group-hover/row:text-primary-400 transition-colors duration-200">
                        {item.title}
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">
                        {/* Same chip language as the Calendar's item-type tag (solid icon circle +
                            bold label in a bordered pill) — that page already solved "Ticket" vs
                            "Delegation" needing to read as distinct badges, not bare icon+text, so
                            this reuses it instead of leaving the one remaining plain-text mention. */}
                        <span className="inline-flex items-center gap-1 pl-0.5 pr-1.5 py-px rounded-full border border-border/50 bg-surface-hover/70">
                          <span className={`flex items-center justify-center size-3.5 rounded-full shrink-0 text-white ${ACTIVITY_CATEGORY_DOT_CLASS[isTicket ? 'ticket' : 'delegation']}`}>
                            <KindIcon size={8} strokeWidth={3} aria-hidden="true" />
                          </span>
                          {/* "Delegation", not "Task" — that's what a task is called everywhere else
                              in the app (Delegation Score, the activity category filter, the nav). */}
                          <span className="font-display font-bold text-text-secondary">{isTicket ? 'Ticket' : 'Delegation'}</span>
                        </span>
                        <span className="size-1 rounded-full bg-border shrink-0" />
                        <span className="tabular-nums">{formatRelativeTime(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge & Chevron. ml-14 on mobile lines the badge up under the title
                      text rather than under the icon, once it's dropped to its own row below. */}
                  <div className="flex items-center gap-4 shrink-0 ml-14 sm:ml-4">
                    <span
                      className={`inline-flex items-center gap-1.5 justify-center text-[10px] sm:text-[11px] font-display font-bold px-2.5 py-1 rounded-full whitespace-nowrap ring-1 ring-inset ${pillClassName}`}
                    >
                      <span className="relative flex items-center justify-center size-1.5 shrink-0">
                        <span className={`absolute inset-0 rounded-full blur-[3px] opacity-70 ${dotClassName}`} />
                        <span className={`relative size-1.5 rounded-full ${dotClassName}`} />
                      </span>
                      {pillLabel}
                    </span>

                    {/* Sliding Chevron (Desktop only to prevent mobile clutter) */}
                    <ChevronRight
                      size={16}
                      aria-hidden="true"
                      className="hidden sm:block text-text-muted/40 transform -translate-x-2 opacity-0 group-hover/row:translate-x-0 group-hover/row:opacity-100 group-hover/row:text-primary-500 transition-all duration-300"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {!isPending && visible.length > 0 && totalPages > 1 && (
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border/50 bg-surface/50 backdrop-blur-sm">
          <span className="text-[11px] font-medium text-text-muted tabular-nums order-2 sm:order-1">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, visible.length)} of {visible.length}
          </span>
          <div className="order-1 sm:order-2">
            <PageNav page={page} totalPages={totalPages} onPageChange={setPage} />
          </div>
        </div>
      )}
    </section>
  );
};
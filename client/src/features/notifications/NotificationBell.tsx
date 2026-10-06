import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, BellRing, AlertCircle, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNavigate } from 'react-router';
import type { Notification } from '@/api/notifications';
import { useNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from './hooks';
import { useNotificationSocket } from './useNotificationSocket';
import { notificationLook, notificationPath, formatNotificationTime, formatRelativeShort, groupNotifications } from './notificationDisplay';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover';
import { Modal } from '../../components/modal';
import { useMediaQuery } from '../../lib/useMediaQuery';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Below Tailwind's `sm` the list opens as a bottom sheet (same shell every dialog uses on a phone)
// instead of a popover hanging off the bell: a popover is anchored to wherever the bell sits in the
// header, which on a narrow screen left it cut off or squeezed against an edge.
const PHONE_QUERY = '(max-width: 639px)';

interface NotificationBellProps {
  // 'light' (default) is tuned for the app's own light-surface header. 'dark' swaps the trigger
  // button to white/opacity variants for use on a fixed-navy chrome (e.g. AdminHeader) — the
  // popover panel itself is unaffected since it's a portal, not a child of that chrome's background.
  tone?: 'light' | 'dark';
  // The unread badge's `ring-surface` was meant to punch a clean gap between the red dot and
  // whatever sits behind it — on AdminHeader's neutral bg-surface bar the badge and its "gap" ring
  // are effectively the same color, so it just reads as a slightly fuzzy outline around the dot
  // instead of a clean edge. Off by default there; still on for the app-wide Header, which hasn't
  // asked to drop it.
  badgeRing?: boolean;
  /** `tone: 'light'` only — tints the bell itself warning-amber instead of plain gray, the one
   *  spot in the app-wide Header that gets its own color rather than the neutral icon-button
   *  treatment (a resting bell is otherwise indistinguishable from any other gray icon button).
   *  Scoped to a prop rather than changing 'light''s default so AdminHeader's own bell — same
   *  tone value, different chrome — isn't affected by a change made for the other header. */
  accent?: boolean;
}

type NotificationFilter = 'all' | 'unread';

interface NotificationListProps {
  notifications: Notification[];
  isError: boolean;
  filter: NotificationFilter;
  onOpen: (n: Notification) => void;
  /** Phone sheet: bigger rows and three message lines instead of two. */
  roomy?: boolean;
}

const NotificationEmpty = ({ icon: Icon, title, hint, tone = 'neutral' }: { icon: typeof BellRing; title: string; hint: string; tone?: 'neutral' | 'danger' }) => (
  <div className="flex flex-col items-center justify-center gap-1 py-14 px-6 text-center">
    <span className={cn('flex items-center justify-center size-14 rounded-2xl mb-2', tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary-500/10 text-primary-600 dark:text-primary-300')}>
      <Icon className="size-6" strokeWidth={1.75} />
    </span>
    <p className="text-sm font-display font-bold text-text">{title}</p>
    <p className="text-sm font-display text-text-muted max-w-[16rem]">{hint}</p>
  </div>
);

// The rows (or the error / empty state), shared by the desktop popover and the phone sheet. Grouped
// under Today / Yesterday / Earlier, so the list reads like a timeline rather than one long run.
const NotificationList = ({ notifications, isError, filter, onOpen, roomy = false }: NotificationListProps) => {
  if (isError) {
    return <NotificationEmpty icon={AlertCircle} tone="danger" title="Couldn't load notifications" hint="We couldn't reach the server. Check your connection and refresh the page." />;
  }

  const shown = filter === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;

  if (shown.length === 0) {
    return filter === 'unread'
      ? <NotificationEmpty icon={CheckCheck} title="Nothing unread" hint="You have read everything. Switch to All to see earlier updates." />
      : <NotificationEmpty icon={BellRing} title="All caught up" hint="New updates about your delegations, tickets and checklists will show up here." />;
  }

  return (
    <div className="flex flex-col pb-2">
      {groupNotifications(shown).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h4 className="px-5 pt-3 pb-1.5 text-xs font-display font-bold text-text-light tracking-wide">{group.label}</h4>
          <ul className="flex flex-col gap-0.5 px-2">
            {group.items.map((n) => {
              const look = notificationLook(n.type);
              const Icon = look.icon;
              const canOpen = notificationPath(n) !== null;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => onOpen(n)}
                    className={cn(
                      'w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors duration-150 cursor-pointer touch-manipulation outline-none',
                      'focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      roomy && 'min-h-[4.5rem] active:bg-surface-hover',
                      n.isRead ? 'hover:bg-surface-hover' : 'bg-primary-500/[0.07] hover:bg-primary-500/[0.12]',
                    )}
                  >
                    <span className={cn('flex items-center justify-center size-10 rounded-xl shrink-0', look.tile)}>
                      <Icon size={18} strokeWidth={2.1} />
                    </span>

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('text-sm font-display leading-snug break-words', n.isRead ? 'font-medium text-text-secondary' : 'font-bold text-text')}>
                          {n.title}
                        </p>
                        {!n.isRead && <span className="mt-1.5 size-2 rounded-full bg-primary-500 shrink-0" aria-label="Unread" />}
                      </div>
                      <p className={cn('text-sm font-display leading-relaxed break-words', roomy ? 'line-clamp-3' : 'line-clamp-2', n.isRead ? 'text-text-muted' : 'text-text-secondary')}>
                        {n.message}
                      </p>
                      <div className="flex items-center gap-1.5 pt-1 text-xs font-display text-text-light">
                        <span className="font-semibold text-text-muted">{look.kindLabel}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={n.createdAt} title={formatNotificationTime(n.createdAt)}>{formatRelativeShort(n.createdAt)}</time>
                        {n.checklistMissed && (
                          <>
                            <span aria-hidden>·</span>
                            <span>That day has ended</span>
                          </>
                        )}
                        {canOpen && <ChevronRight size={12} className="ml-auto shrink-0" aria-hidden />}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
};

// All / Unread: two quiet pills in the panel header.
const NotificationTabs = ({ value, onChange, unread }: { value: NotificationFilter; onChange: (v: NotificationFilter) => void; unread: number }) => (
  <div role="group" aria-label="Show notifications" className="inline-flex items-center gap-1 p-1 rounded-full bg-surface-hover border border-border/60">
    {(['all', 'unread'] as const).map((key) => (
      <button
        key={key}
        type="button"
        aria-pressed={value === key}
        onClick={() => onChange(key)}
        className={cn(
          'h-7 pointer-coarse:h-9 px-3 rounded-full text-xs font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
          value === key ? 'bg-surface text-text border border-border/70' : 'text-text-muted hover:text-text border border-transparent',
        )}
      >
        {key === 'all' ? 'All' : `Unread${unread > 0 ? ` ${unread}` : ''}`}
      </button>
    ))}
  </div>
);

export const NotificationBell = ({ tone = 'light', badgeRing = true, accent = false }: NotificationBellProps) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  // Rings the bell for a beat when a notification lands while the panel is closed — the toast
  // (useNotificationSocket) already surfaces it, this is what makes the bell itself say "new" if
  // someone glances at the header a second later instead of catching the toast.
  const [justArrived, setJustArrived] = useState(false);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isPhone = useMediaQuery(PHONE_QUERY);

  const { data: notifications = [], isError } = useNotificationsQuery();
  const markRead = useMarkNotificationReadMutation();
  const markAllRead = useMarkAllNotificationsReadMutation();
  const navigate = useNavigate();

  useNotificationSocket({
    onArrive: () => {
      if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
      setJustArrived(true);
      arrivalTimer.current = setTimeout(() => setJustArrived(false), 1600);
    },
    // Safe here: NotificationBell only ever renders inside Header/AdminHeader, both of which sit
    // under <RouterProvider> (App.tsx's own bare useNotificationSocket() call, above the Router,
    // deliberately doesn't pass this — see that hook's own comment).
    navigate,
  });
  useEffect(() => () => { if (arrivalTimer.current) clearTimeout(arrivalTimer.current); }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    const path = notificationPath(n);
    if (path) navigate(path);
  };

  // One bell for both layouts. On desktop it is the Popover's trigger (asChild); on a phone it just
  // opens the sheet. 44px on touch screens, 40px with a mouse.
  const bell = (onClick?: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center size-10 pointer-coarse:size-11 rounded-full transition-all duration-200 cursor-pointer touch-manipulation",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
        tone === 'dark'
          ? cn("text-white/70 hover:text-white hover:bg-white/10", open && "bg-white/10 text-white")
          : accent
            ? cn("text-warning hover:bg-warning/10", open && "bg-warning/10")
            : cn(
                "text-text-light hover:text-text hover:bg-surface-hover",
                open && "bg-surface-hover text-text"
              ),
        justArrived && !open && (tone === 'dark' ? 'text-white bg-white/10' : 'text-danger bg-danger/10')
      )}
      aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <Bell className={cn("w-5 h-5 transition-transform duration-300", open && "scale-90", justArrived && "animate-[bell-ring_0.5s_ease-in-out]")} />

      {unreadCount > 0 && (
        <span className={cn(
          "absolute top-1 right-1 flex items-center justify-center min-w-5 h-5 px-1",
          "rounded-full bg-danger text-white text-xs font-bold leading-none",
          badgeRing && "ring-2 ring-surface",
          "transform translate-x-1/2 -translate-y-1/2",
          "animate-in zoom-in duration-300",
          justArrived && "animate-pulse"
        )}>
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );

  const markAllButton = (
    <button
      type="button"
      onClick={() => markAllRead.mutate()}
      disabled={markAllRead.isPending}
      className={cn(
        "flex items-center gap-1.5 min-h-8 pointer-coarse:min-h-11 text-xs font-display font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-600",
        "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md px-1.5 -mx-1.5 cursor-pointer touch-manipulation disabled:opacity-50"
      )}
    >
      <CheckCheck className="w-3.5 h-3.5" />
      Mark all read
    </button>
  );

  if (isPhone) {
    return (
      <>
        {bell(() => setOpen(true))}
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          icon={<Bell className="size-5" />}
          title={
            <span className="flex items-center gap-2">
              Notifications
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-display font-bold">
                  {unreadCount} new
                </span>
              )}
            </span>
          }
          size="md"
          // Rows run edge to edge; the sheet keeps a steady height so it doesn't jump as items load.
          contentClassName="h-[85dvh]"
          bodyClassName="gap-0 p-0 overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/60 shrink-0">
            <NotificationTabs value={filter} onChange={setFilter} unread={unreadCount} />
            {unreadCount > 0 && markAllButton}
          </div>
          <NotificationList notifications={notifications} isError={isError} filter={filter} onOpen={handleClick} roomy />
        </Modal>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{bell()}</PopoverTrigger>

      {/* Portal-backed (via the shared Popover primitive), not a plain absolutely-positioned div —
          the bell used to render its panel as a child of whatever chrome it sat in, which was
          fine in the app-wide light Header but silently clipped to nothing whenever the trigger
          lived inside an `overflow-hidden` container (AdminHeader's fixed-navy card is exactly
          that), since a portal escapes the DOM tree its trigger sits in instead of being bound by
          an ancestor's overflow. Radix still anchors it to the trigger button regardless of where
          it renders. */}
      <PopoverContent
        align="end"
        sideOffset={10}
        className="w-96 p-0 rounded-2xl border border-border bg-surface overflow-hidden flex flex-col max-h-[32rem]"
      >
        <header className="flex flex-col gap-3 px-5 pt-4 pb-3 border-b border-border/60 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-display font-bold text-text tracking-tight">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-display font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && markAllButton}
          </div>
          <NotificationTabs value={filter} onChange={setFilter} unread={unreadCount} />
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <NotificationList notifications={notifications} isError={isError} filter={filter} onOpen={handleClick} />
        </div>
      </PopoverContent>
    </Popover>
  );
};

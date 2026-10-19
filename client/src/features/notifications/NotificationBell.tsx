import { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, BellRing, AlertCircle, ChevronRight, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNavigate } from 'react-router';
import type { Notification } from '@/api/notifications';
import { useNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from './hooks';
import { useNotificationSocket } from './useNotificationSocket';
import { notificationLook, notificationPath, formatNotificationTime, formatRelativeShort, groupNotifications } from './notificationDisplay';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '../../components/ui/sheet';
import { haptic } from '../../lib/haptics';
import { AttentionStrip } from './AttentionStrip';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

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
  onSwipeRead: (n: Notification) => void;
}

const NotificationEmpty = ({ icon: Icon, title, hint, tone = 'neutral' }: { icon: typeof BellRing; title: string; hint: string; tone?: 'neutral' | 'danger' }) => (
  <div className="flex flex-col items-center justify-center gap-1 py-12 px-6 text-center">
    <span className={cn('flex items-center justify-center size-14 rounded-2xl mb-2', tone === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary-500/10 text-primary-600 dark:text-primary-300')}>
      <Icon className="size-6" strokeWidth={1.75} />
    </span>
    <p className="t-meta font-display font-semibold text-text">{title}</p>
    <p className="t-meta text-text-muted max-w-[16rem]">{hint}</p>
  </div>
);

// The rows (or the error / empty state), shared by the desktop popover and the phone sheet. Grouped
// under Today / Yesterday / Earlier, so the list reads like a timeline rather than one long run.
const NotificationList = ({ notifications, isError, filter, onOpen, onSwipeRead, roomy = false }: NotificationListProps) => {
  const dragged = useRef(false);
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
          <h4 className="px-4 pt-3 pb-1 t-meta font-display font-semibold text-text-light">{group.label}</h4>
          <ul className="flex flex-col gap-0.5 px-2">
            {group.items.map((n) => {
              const look = notificationLook(n.type);
              const Icon = look.icon;
              const canOpen = notificationPath(n) !== null;
              return (
                <li key={n.id} className="relative overflow-hidden rounded-xl">
                  {!n.isRead && (
                    <span aria-hidden className="absolute inset-y-0 right-0 flex w-28 items-center justify-end gap-1.5 bg-primary-500/10 pr-4 t-meta font-display font-semibold text-primary-700 dark:text-primary-300">
                      <Check size={14} strokeWidth={2.5} />
                      Mark read
                    </span>
                  )}
                  <motion.div
                    drag={n.isRead ? false : 'x'}
                    dragDirectionLock
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={{ left: 0.5, right: 0 }}
                    onDragStart={() => { dragged.current = true; }}
                    onDragEnd={(_, info) => {
                      window.setTimeout(() => { dragged.current = false; }, 80);
                      if (info.offset.x < -72 || info.velocity.x < -600) onSwipeRead(n);
                    }}
                    className="relative bg-surface rounded-xl"
                  >
                  <button
                    onClick={() => { if (!dragged.current) onOpen(n); }}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-colors duration-150 cursor-pointer touch-manipulation outline-none',
                      'focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      roomy && 'active:bg-surface-hover',
                      n.isRead ? 'hover:bg-surface-hover' : 'bg-primary-500/[0.07] hover:bg-primary-500/[0.12]',
                    )}
                  >
                    <span className={cn('flex items-center justify-center size-8 rounded-lg shrink-0', look.tile)}>
                      <Icon size={15} strokeWidth={2.25} />
                    </span>

                    <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn('t-meta font-display leading-snug break-words', n.isRead ? 'font-medium text-text-secondary' : 'font-semibold text-text')}>
                          {n.title}
                        </p>
                        {!n.isRead && <span className="mt-1.5 size-2 rounded-full bg-primary-500 shrink-0" aria-label="Unread" />}
                      </div>
                      <p className={cn('t-meta leading-snug break-words', roomy ? 'line-clamp-3' : 'line-clamp-2', n.isRead ? 'text-text-muted' : 'text-text-secondary')}>
                        {n.message}
                      </p>
                      <div className="flex items-center gap-1.5 pt-0.5 t-meta font-display text-text-light">
                        <span className="font-semibold text-text-muted">{look.kindLabel}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={n.createdAt} title={formatNotificationTime(n.createdAt)}>{formatRelativeShort(n.createdAt)}</time>
                        {n.checklistMissed && (
                          <>
                            <span aria-hidden>·</span>
                            <span>Closed</span>
                          </>
                        )}
                        {canOpen && <ChevronRight size={12} className="ml-auto shrink-0" aria-hidden />}
                      </div>
                    </div>
                  </button>
                  </motion.div>
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
  const panelRef = useRef<HTMLDivElement>(null);
  // Rings the bell for a beat when a notification lands while the panel is closed — the toast
  // (useNotificationSocket) already surfaces it, this is what makes the bell itself say "new" if
  // someone glances at the header a second later instead of catching the toast.
  const [justArrived, setJustArrived] = useState(false);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        "relative flex items-center justify-center size-10 pointer-coarse:size-11 rounded-xl border transition-colors duration-200 cursor-pointer touch-manipulation active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500",
        tone === 'dark'
          ? cn("border-transparent text-white/70 hover:text-white hover:bg-white/10", open && "bg-white/10 text-white")
          : accent
            ? cn("text-primary-600 dark:text-primary-300 hover:bg-primary-500/10", open && "bg-primary-500/10")
            : cn(
                // Its own soft blue tile: the bell is the one header control that carries news.
                "border-primary-500/15 bg-primary-500/[0.08] text-primary-600 dark:text-primary-300 hover:bg-primary-500/15",
                open && "bg-primary-500/15"
              ),
        justArrived && !open && (tone === 'dark' ? 'text-white bg-white/10' : 'text-danger bg-danger/10')
      )}
      aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <Bell className={cn("size-[1.125rem] transition-transform duration-300", open && "scale-90", justArrived && "animate-[bell-ring_0.5s_ease-in-out]")} />

      {unreadCount > 0 && (
        <span className={cn(
          "absolute -top-1 -right-1 flex items-center justify-center min-w-[1.125rem] h-[1.125rem] px-1",
          "rounded-full bg-linear-to-br from-danger to-danger/80 text-white t-meta font-display font-bold leading-none tabular-nums",
          badgeRing ? "ring-2 ring-surface" : "ring-2 ring-surface/80",
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

  // One panel for every screen: a side sheet from the right edge (full width on a phone), so the list always has the
  // whole height and never hangs off the bell or gets cut against an edge.
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {bell(() => { haptic('tap'); setOpen(true); })}
      <SheetContent
        side="right"
        showCloseButton={false}
        ref={panelRef}
        // The panel itself takes focus on open, not the X: no focus ring before anyone touches anything.
        onOpenAutoFocus={(e) => { e.preventDefault(); panelRef.current?.focus({ preventScroll: true }); }}
        className="w-full sm:max-w-[400px] p-0 flex flex-col h-full overflow-hidden font-sans shadow-none">
        <SheetHeader className="flex flex-col gap-2.5 border-b border-border/60 px-4 pt-3 pb-3 text-left shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="flex items-center justify-center size-8 rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white shrink-0" aria-hidden="true"><Bell className="size-4" strokeWidth={2.25} /></span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <SheetTitle className="t-card font-display font-bold text-text">Notifications</SheetTitle>
              {unreadCount > 0 && (
                <span className="px-1.5 py-px rounded-full bg-danger/10 text-danger t-meta font-display font-bold tabular-nums">{unreadCount} new</span>
              )}
            </div>
            <SheetClose className="relative flex items-center justify-center size-8 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 after:absolute after:-inset-1.5">
              <X size={17} strokeWidth={2.5} />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>
          <SheetDescription className="sr-only">Updates about your delegations, tickets and checklists</SheetDescription>
          <div className="flex items-center justify-between gap-2">
            <NotificationTabs value={filter} onChange={setFilter} unread={unreadCount} />
            {unreadCount > 0 && markAllButton}
          </div>
        </SheetHeader>

        <AttentionStrip onNavigate={() => setOpen(false)} />

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain custom-scrollbar pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <NotificationList notifications={notifications} isError={isError} filter={filter} onOpen={handleClick} onSwipeRead={(n) => { haptic('tap'); markRead.mutate(n.id); }} roomy />
        </div>
      </SheetContent>
    </Sheet>
  );
};

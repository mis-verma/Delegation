import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, BellRing, AlertCircle, ChevronRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNavigate } from 'react-router';
import type { Notification } from '@/api/notifications';
import { useNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from './hooks';
import { useNotificationSocket } from './useNotificationSocket';
import { notificationLook, notificationPath, formatNotificationTime, formatRelativeShort } from './notificationDisplay';
import { Popover, PopoverTrigger, PopoverContent } from '../../components/ui/popover';

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

export const NotificationBell = ({ tone = 'light', badgeRing = true, accent = false }: NotificationBellProps) => {
  const [open, setOpen] = useState(false);
  // Rings the bell for a beat when a notification lands while the panel is closed — the toast
  // (useNotificationSocket) already surfaces it, this is what makes the bell itself say "new" if
  // someone glances at the header a second later instead of catching the toast.
  const [justArrived, setJustArrived] = useState(false);
  const arrivalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: notifications = [], isError } = useNotificationsQuery();
  const markRead = useMarkNotificationReadMutation();
  const markAllRead = useMarkAllNotificationsReadMutation();
  const navigate = useNavigate();

  useNotificationSocket(() => {
    if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
    setJustArrived(true);
    arrivalTimer.current = setTimeout(() => setJustArrived(false), 1600);
  });
  useEffect(() => () => { if (arrivalTimer.current) clearTimeout(arrivalTimer.current); }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    const path = notificationPath(n);
    if (path) navigate(path);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 cursor-pointer",
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
        >
          <Bell className={cn("w-5 h-5 transition-transform duration-300", open && "scale-90", justArrived && "animate-[bell-ring_0.5s_ease-in-out]")} />

          {unreadCount > 0 && (
            <span className={cn(
              "absolute top-1.5 right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1",
              "rounded-full bg-danger text-white text-[10px] font-bold leading-none",
              badgeRing && "ring-2 ring-surface",
              "transform translate-x-1/2 -translate-y-1/2",
              "animate-in zoom-in duration-300",
              justArrived && "animate-pulse"
            )}>
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

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
        className="w-[calc(100vw-2rem)] sm:w-96 p-0 rounded-2xl border border-border bg-surface overflow-hidden flex flex-col max-h-[32rem]"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-border/60 bg-surface-hover/50 shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-display font-bold text-text">Notifications</h3>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-danger/15 text-danger text-[10px] font-display font-bold">
                {unreadCount} new
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              className={cn(
                "flex items-center gap-1.5 min-h-8 text-xs font-display font-medium text-text-light hover:text-primary-600",
                "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md px-1.5 -mx-1.5 cursor-pointer"
              )}
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </header>

        <div className="flex-1 overflow-y-auto no-scrollbar relative">
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex items-center justify-center mb-3 text-danger">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-sm font-display font-medium text-text">Couldn't load notifications</p>
              <p className="text-xs font-display text-text-muted mt-1">Failed to connect to the server. Please refresh the page.</p>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex items-center justify-center mb-3 text-text-light">
                <BellRing className="w-6 h-6" />
              </div>
              <p className="text-sm font-display font-medium text-text">All caught up!</p>
              <p className="text-xs font-display text-text-muted mt-1">Check back later for new notifications.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {notifications.map(n => {
                const look = notificationLook(n.type);
                const Icon = look.icon;
                const canOpen = notificationPath(n) !== null;
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => handleClick(n)}
                      className={cn(
                        "w-full flex items-start gap-3 p-4 text-left transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:bg-surface-hover relative",
                        // Unread rows get a left accent bar in the badge's own colour plus a
                        // stronger tint, so "needs attention" is legible at a glance, not just
                        // from the small dot the old version relied on.
                        n.isRead
                          ? "bg-surface hover:bg-surface-hover"
                          : "bg-primary-500/[0.06] hover:bg-primary-500/10 before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-primary-500"
                      )}
                    >
                      <span className={cn("flex items-center justify-center size-9 rounded-full shrink-0", look.tile)}>
                        <Icon size={16} strokeWidth={2.25} />
                      </span>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={cn(
                            "text-sm font-display leading-snug",
                            n.isRead ? "font-medium text-text-secondary" : "font-bold text-text"
                          )}>
                            {n.title}
                          </p>
                          {!n.isRead && <span className="mt-1 size-1.5 rounded-full bg-primary-500 shrink-0" aria-hidden />}
                        </div>
                        <p className={cn(
                          "text-sm font-display line-clamp-2 leading-relaxed",
                          n.isRead ? "text-text-muted" : "text-text-secondary"
                        )}>
                          {n.message}
                        </p>
                        <div className="flex items-center gap-1.5 pt-1">
                          <p className="text-[11px] font-display font-semibold text-text-light" title={formatRelativeShort(n.createdAt)}>
                            {formatNotificationTime(n.createdAt)}
                          </p>
                          {canOpen && (
                            <ChevronRight size={11} className="text-text-light" aria-hidden />
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {notifications.length > 0 && (
            <div className="h-6 w-full bg-gradient-to-t from-surface to-transparent absolute bottom-0 pointer-events-none" />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, BellRing, AlertCircle, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useNavigate } from 'react-router';
import type { Notification } from '@/api/notifications';
import { useNotificationsQuery, useMarkNotificationReadMutation, useMarkAllNotificationsReadMutation } from './hooks';
import { useNotificationSocket } from './useNotificationSocket';
import { clusterNotifications, groupNotifications, notificationPath } from './notificationDisplay';
import { NotificationItem } from './NotificationItem';
import { NotificationCluster } from './NotificationCluster';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetClose } from '../../components/ui/sheet';
import { haptic } from '../../lib/haptics';
import { setAppBadge } from '../../lib/push';
import { AttentionStrip } from './AttentionStrip';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface NotificationBellProps {
  tone?: 'light' | 'dark';
  badgeRing?: boolean;
  accent?: boolean;
}

type NotificationFilter = 'all' | 'unread';

interface NotificationListProps {
  notifications: Notification[];
  isError: boolean;
  filter: NotificationFilter;
  onOpen: (n: Notification) => void;
  roomy?: boolean;
  onSwipeRead: (n: Notification) => void;
  onMarkAllRead: (items: Notification[]) => void;
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

const NotificationList = ({ notifications, isError, filter, onOpen, onSwipeRead, onMarkAllRead, roomy = false }: NotificationListProps) => {
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
            {clusterNotifications(group.items).map((entry) =>
              entry.kind === 'single' ? (
                <NotificationItem key={entry.item.id} notification={entry.item} onOpen={onOpen} onSwipeRead={onSwipeRead} roomy={roomy} />
              ) : (
                <NotificationCluster key={entry.type} items={entry.items} onOpen={onOpen} onSwipeRead={onSwipeRead} onMarkAllRead={onMarkAllRead} roomy={roomy} />
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
};

const NotificationTabs = ({ value, onChange, unread }: { value: NotificationFilter; onChange: (v: NotificationFilter) => void; unread: number }) => (
  <div role="group" aria-label="Show notifications" className="inline-flex items-center gap-1 p-1 rounded-full bg-surface-hover border border-border/60">
    {(['all', 'unread'] as const).map((key) => (
      <button
        key={key}
        type="button"
        aria-pressed={value === key}
        onClick={() => onChange(key)}
        className={cn(
          'h-7 pointer-coarse:h-9 px-3 rounded-full t-meta font-display font-semibold transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
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
    navigate,
  });
  useEffect(() => () => { if (arrivalTimer.current) clearTimeout(arrivalTimer.current); }, []);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  useEffect(() => { setAppBadge(unreadCount); }, [unreadCount]);

  const handleClick = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    const path = notificationPath(n);
    if (path) navigate(path);
  };

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
                "border-border/60 bg-surface-hover/50 text-text-secondary hover:bg-surface-hover hover:text-text",
                open && "bg-surface-hover text-text"
              ),
        justArrived && !open && (tone === 'dark' ? 'text-white bg-white/10' : 'text-danger bg-danger/10')
      )}
      aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      {unreadCount > 0 ? (
        <BellRing className={cn("size-5 transition-transform duration-300", open && "scale-90", justArrived && "animate-[bell-ring_0.5s_ease-in-out]")} strokeWidth={2.25} />
      ) : (
        <Bell className={cn("size-5 transition-transform duration-300", open && "scale-90")} strokeWidth={2} />
      )}
      {justArrived && !open && <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-danger/50 animate-ping motion-reduce:hidden" />}

      {unreadCount > 0 && (
        <span className={cn(
          "absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-5 h-5 px-1.5",
          "rounded-full bg-linear-to-br from-danger to-danger/80 text-white text-[11px] font-display font-extrabold leading-none tabular-nums",
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
        "flex items-center gap-1.5 min-h-8 pointer-coarse:min-h-11 t-meta font-display font-semibold text-primary-700 dark:text-primary-300 hover:text-primary-600",
        "transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md px-1.5 -mx-1.5 cursor-pointer touch-manipulation disabled:opacity-50"
      )}
    >
      <CheckCheck className="w-3.5 h-3.5" />
      Mark all read
    </button>
  );

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {bell(() => { haptic('tap'); setOpen(true); })}
      <SheetContent
        side="right"
        showCloseButton={false}
        ref={panelRef}
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
          <NotificationList notifications={notifications} isError={isError} filter={filter} onOpen={handleClick} onSwipeRead={(n) => { haptic('tap'); markRead.mutate(n.id); }} onMarkAllRead={(items) => { haptic('tap'); items.forEach((n) => markRead.mutate(n.id)); }} roomy />
        </div>
      </SheetContent>
    </Sheet>
  );
};

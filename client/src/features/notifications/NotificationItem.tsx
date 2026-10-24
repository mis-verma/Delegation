import { Check, ChevronRight } from 'lucide-react';
import { SwipeRow } from '../../components/swipeRow/SwipeRow';
import { cn } from '@/lib/utils';
import type { Notification } from '@/api/notifications';
import { notificationLook, notificationPath, formatNotificationTime, formatRelativeShort } from './notificationDisplay';

interface NotificationItemProps {
  notification: Notification;
  onOpen: (n: Notification) => void;
  onSwipeRead: (n: Notification) => void;
  roomy?: boolean;
}

export const NotificationItem = ({ notification: n, onOpen, onSwipeRead, roomy = false }: NotificationItemProps) => {
  const look = notificationLook(n.type);
  const Icon = look.icon;
  const canOpen = notificationPath(n) !== null;

  return (
    <li className="relative overflow-hidden rounded-xl">
      <SwipeRow
        className="rounded-xl"
        left={n.isRead ? undefined : { label: 'Mark read', icon: <Check size={14} strokeWidth={2.5} />, tone: 'success', onTrigger: () => onSwipeRead(n) }}
      >
        <div className="relative bg-surface rounded-xl">
          <button
            onClick={() => onOpen(n)}
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
        </div>
      </SwipeRow>
    </li>
  );
};

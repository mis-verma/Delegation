import { useState } from 'react';
import { ChevronDown, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Notification } from '@/api/notifications';
import { NotificationItem } from './NotificationItem';
import { notificationLook, clusterSubjects, formatRelativeShort } from './notificationDisplay';

interface NotificationClusterProps {
  items: Notification[];
  onOpen: (n: Notification) => void;
  onSwipeRead: (n: Notification) => void;
  onMarkAllRead: (items: Notification[]) => void;
  roomy?: boolean;
}

const SUBJECTS_SHOWN = 2;

export const NotificationCluster = ({ items, onOpen, onSwipeRead, onMarkAllRead, roomy = false }: NotificationClusterProps) => {
  const [open, setOpen] = useState(false);
  const first = items[0]!;
  const look = notificationLook(first.type);
  const Icon = look.icon;
  const unread = items.filter((n) => !n.isRead);
  const subjects = clusterSubjects(items);
  const shown = subjects.slice(0, SUBJECTS_SHOWN).join(', ');
  const more = subjects.length - SUBJECTS_SHOWN;
  const listId = `cluster-${first.id}`;

  return (
    <li className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={listId}
        className={cn(
          'w-full flex items-start gap-2.5 px-2.5 py-2.5 rounded-xl text-left transition-colors duration-150 cursor-pointer touch-manipulation outline-none',
          'focus-visible:ring-2 focus-visible:ring-primary-500/40',
          unread.length > 0 ? 'bg-primary-500/[0.07] hover:bg-primary-500/[0.12]' : 'hover:bg-surface-hover',
        )}
      >
        <span className={cn('relative flex items-center justify-center size-8 rounded-lg shrink-0', look.tile)}>
          <Icon size={15} strokeWidth={2.25} />
        </span>

        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <div className="flex items-start justify-between gap-2">
            <p className={cn('t-meta font-display leading-snug break-words', unread.length > 0 ? 'font-semibold text-text' : 'font-medium text-text-secondary')}>
              {first.title}
              <span className="ml-1.5 inline-flex items-center rounded-full bg-surface-hover px-1.5 t-meta font-bold tabular-nums text-text-secondary">{items.length}</span>
            </p>
            {unread.length > 0 && <span className="mt-1.5 size-2 rounded-full bg-primary-500 shrink-0" aria-label={`${unread.length} unread`} />}
          </div>
          <p className={cn('t-meta leading-snug break-words line-clamp-2', unread.length > 0 ? 'text-text-secondary' : 'text-text-muted')}>
            {shown}{more > 0 ? ` and ${more} more` : ''}
          </p>
          <div className="flex items-center gap-1.5 pt-0.5 t-meta font-display text-text-light">
            <span className="font-semibold text-text-muted">{look.kindLabel}</span>
            <span aria-hidden>·</span>
            <time dateTime={first.createdAt}>{formatRelativeShort(first.createdAt)}</time>
            <ChevronDown size={12} className={cn('ml-auto shrink-0 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
          </div>
        </div>
      </button>

      {open && (
        <div id={listId} className="flex flex-col gap-0.5 pl-3 ml-4 border-l border-border/60">
          {unread.length > 0 && (
            <button
              type="button"
              onClick={() => onMarkAllRead(unread)}
              className="self-start inline-flex items-center gap-1.5 min-h-11 pointer-fine:min-h-8 px-2.5 rounded-lg t-meta font-display font-semibold text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <CheckCheck size={13} aria-hidden />
              Mark these {unread.length} as read
            </button>
          )}
          <ul className="flex flex-col gap-0.5">
            {items.map((n) => (
              <NotificationItem key={n.id} notification={n} onOpen={onOpen} onSwipeRead={onSwipeRead} roomy={roomy} />
            ))}
          </ul>
        </div>
      )}
    </li>
  );
};

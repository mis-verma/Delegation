import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { AlarmClock, ChevronRight } from 'lucide-react';
import { Button, Modal } from '../../components';
import { formatDueLabel } from '../tickets/ticketDisplay';
import type { Ticket } from '../../api/ticket';

interface OverdueTicketsPopupProps {
  tickets: readonly Ticket[];
  total?: number;
  userId: string | undefined;
}

const LIST_LIMIT = 5;
const SNOOZE_MS = 2 * 60 * 60 * 1000;

const isLate = (t: Ticket, userId: string) =>
  t.assigneeId === userId && t.isOverdue && !t.declinedAt && (t.status === 'OPEN' || t.status === 'IN_PROGRESS');

const nextMidnight = () => {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
};

const readNextAt = (key: string): number => {
  try {
    const n = Number(localStorage.getItem(key));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};

const writeNextAt = (key: string, at: number) => {
  try {
    localStorage.setItem(key, String(at));
  } catch {
    return;
  }
};

export const OverdueTicketsPopup = memo(({ tickets, total, userId }: OverdueTicketsPopupProps) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const key = `tm-overdue-popup-${userId ?? 'anon'}`;

  const late = useMemo(() => (userId ? tickets.filter((t) => isLate(t, userId)) : []), [tickets, userId]);
  const hasLate = late.length > 0;

  useEffect(() => {
    if (!hasLate || Date.now() < readNextAt(key)) return;
    setOpen(true);
  }, [hasLate, key, tickets]);

  useEffect(() => {
    const ids = new Set(late.map((t) => t.id));
    if (seen.current === null) {
      if (tickets.length > 0) seen.current = ids;
      return;
    }
    const fresh = late.filter((t) => !seen.current?.has(t.id));
    seen.current = ids;
    if (fresh.length > 0 && !open) {
      toast.error(fresh.length === 1 ? `Ticket overdue: ${fresh[0]?.title ?? ''}` : `${fresh.length} tickets just became overdue`, {
        action: { label: 'View', onClick: () => navigate(`/tickets?open=${fresh[0]?.id ?? ''}`) },
      });
    }
  }, [late, tickets.length, open, navigate]);

  const later = () => {
    writeNextAt(key, Date.now() + SNOOZE_MS);
    setOpen(false);
  };

  const gotIt = () => {
    writeNextAt(key, nextMidnight());
    setOpen(false);
  };

  const openTicket = (id: string) => {
    writeNextAt(key, nextMidnight());
    setOpen(false);
    navigate(`/tickets?open=${id}`);
  };

  if (!hasLate) return null;

  const lateCount = Math.max(late.length, total ?? 0);
  const shown = late.slice(0, LIST_LIMIT);
  const more = lateCount - shown.length;
  const seeAll = () => {
    writeNextAt(key, nextMidnight());
    setOpen(false);
    navigate(userId ? `/tickets?quickFilter=delayed&assigneeIds=${encodeURIComponent(userId)}` : '/tickets?quickFilter=delayed');
  };

  return (
    <Modal
      open={open}
      onClose={later}
      size="md"
      icon={<AlarmClock size={20} strokeWidth={2.25} aria-hidden="true" />}
      iconTone="danger"
      title={lateCount === 1 ? 'You have an overdue ticket' : `You have ${lateCount} overdue tickets`}
      description="Open each one and post an update, so everyone knows where it stands."
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="secondary" onClick={later} className="h-11 font-display font-semibold sm:h-10">Remind me later</Button>
          <Button type="button" variant="primary" onClick={gotIt} className="h-11 font-display font-semibold sm:h-10">Got it</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {shown.map((t) => {
          const due = formatDueLabel(t);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => openTicket(t.id)}
                className="group flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-xl border border-danger/30 border-l-[3px] border-l-danger bg-danger/5 px-3 py-2.5 text-left outline-none transition-colors duration-150 hover:border-danger/60 focus-visible:ring-2 focus-visible:ring-danger/30"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 t-card font-display font-semibold leading-snug text-text">{t.title}</span>
                  {due && <span className="t-meta font-medium text-danger">{due.text}</span>}
                </span>
                <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <button
          type="button"
          onClick={seeAll}
          className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-lg px-2 t-meta font-display font-semibold text-primary-700 outline-none transition-colors duration-150 hover:bg-primary-500/10 focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:text-primary-300"
        >
          See all {lateCount} overdue tickets
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      )}
      </div>
    </Modal>
  );
});
OverdueTicketsPopup.displayName = 'OverdueTicketsPopup';

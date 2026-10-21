import { memo, useRef, useState, type TouchEvent } from 'react';
import { Check, ChevronDown, Clock3, CornerUpLeft, Repeat, Send, Store } from 'lucide-react';
import { Button } from '../../components';
import { cn } from '@/lib/utils';
import { useAuth } from '../../context/AuthContext';
import { formatDateTime } from '../checklist/checklistDisplay';
import { RiskChips } from './RiskChips';
import { ComplianceMeter } from './ComplianceMeter';
import { QuestionPreview } from './QuestionPreview';
import { formatWaiting, type ChecklistRow } from './verificationModel';

const SWIPE_TRIGGER_PX = 96;
const SWIPE_LOCK_PX = 12;

interface ChecklistQueueRowProps {
  row: ChecklistRow;
  now: number;
  active: boolean;
  showDepartment?: boolean;
  inlineActions?: 'below-lg' | 'always';
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onSendBack: (id: string) => void;
  onSendBackItem?: (id: string, itemId: string) => void;
}

export const ChecklistQueueRow = memo(function ChecklistQueueRow({
  row, now, active, showDepartment = true, inlineActions = 'below-lg', onOpen, onApprove, onSendBack, onSendBackItem,
}: ChecklistQueueRowProps) {
  const { id, instance, risk } = row;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const approveHintRef = useRef<HTMLDivElement>(null);
  const sendBackHintRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({ x: 0, y: 0, dx: 0, axis: null as 'x' | 'y' | null });
  const [showQuestions, setShowQuestions] = useState(false);
  const { user } = useAuth();

  const paint = (dx: number) => {
    const surface = surfaceRef.current;
    if (surface) surface.style.transform = dx ? `translateX(${dx}px)` : '';
    if (approveHintRef.current) approveHintRef.current.style.opacity = dx > 0 ? String(Math.min(1, dx / SWIPE_TRIGGER_PX)) : '0';
    if (sendBackHintRef.current) sendBackHintRef.current.style.opacity = dx < 0 ? String(Math.min(1, -dx / SWIPE_TRIGGER_PX)) : '0';
  };

  const onTouchStart = (e: TouchEvent) => {
    if (e.touches.length !== 1 || (inlineActions === 'below-lg' && window.matchMedia('(min-width: 1024px)').matches)) return;
    const t = e.touches[0];
    gesture.current = { x: t.clientX, y: t.clientY, dx: 0, axis: null };
  };

  const onTouchMove = (e: TouchEvent) => {
    const g = gesture.current;
    const t = e.touches[0];
    const dx = t.clientX - g.x;
    const dy = t.clientY - g.y;
    if (g.axis === null && (Math.abs(dx) > SWIPE_LOCK_PX || Math.abs(dy) > SWIPE_LOCK_PX)) {
      g.axis = Math.abs(dx) > Math.abs(dy) * 1.5 ? 'x' : 'y';
    }
    if (g.axis !== 'x') return;
    g.dx = dx;
    paint(dx);
  };

  const onTouchEnd = () => {
    const { axis, dx } = gesture.current;
    gesture.current = { x: 0, y: 0, dx: 0, axis: null };
    if (axis !== 'x') return;
    paint(0);
    if (dx >= SWIPE_TRIGGER_PX) onApprove(id);
    else if (dx <= -SWIPE_TRIGGER_PX) onSendBack(id);
  };

  const lgHidden = inlineActions === 'below-lg' ? 'lg:hidden' : '';
  const waiting = formatWaiting(row.waitingSince, now);
  const waitingDays = (now - row.waitingSince) / 86_400_000;
  const submitted = instance.submittedAt
    ? `${instance.submittedByName ? `Submitted by ${instance.submittedByName}` : 'Submitted'} · ${formatDateTime(instance.submittedAt)}`
    : `Not submitted yet${row.assigneeNames.length ? ` · ${row.assigneeNames.slice(0, 2).join(', ')}${row.assigneeNames.length > 2 ? ` +${row.assigneeNames.length - 2}` : ''}` : ''}`;

  return (
    <li className="relative rounded-xl">
      <div ref={approveHintRef} aria-hidden className={cn('absolute inset-0 flex items-center justify-start gap-2 pl-4 rounded-xl bg-success/15 text-success t-meta font-display font-semibold opacity-0', lgHidden)}>
        <Check size={16} /> Approve
      </div>
      <div ref={sendBackHintRef} aria-hidden className={cn('absolute inset-0 flex items-center justify-end gap-2 pr-4 rounded-xl bg-danger/15 text-danger t-meta font-display font-semibold opacity-0', lgHidden)}>
        Send back <CornerUpLeft size={16} />
      </div>

      <div
        ref={surfaceRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className={cn(
          'relative flex flex-col gap-2 p-2.5 sm:p-3.5 rounded-xl border bg-surface touch-pan-y transition-[border-color,background-color] duration-150',
          active ? 'border-border-hover' : 'border-border/60 hover:border-border-hover',
          risk.criticalFailed > 0 && !active && 'border-danger/40',
        )}
      >
        <button
          type="button"
          data-queue-row={id}
          aria-current={active ? 'true' : undefined}
          onClick={() => onOpen(id)}
          className="flex items-start gap-3 min-w-0 text-left cursor-pointer outline-none rounded-md focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Repeat size={14} aria-hidden className="mt-0.5 shrink-0 text-text-light" />
          <span className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="flex items-start justify-between gap-3">
              <span className={cn('t-meta sm:t-card font-display text-text leading-snug line-clamp-2', active ? 'font-bold' : 'font-semibold')}>
                {instance.title}
              </span>
              <span
                className={cn('inline-flex shrink-0 items-center gap-1 t-meta font-display font-semibold tabular-nums', waitingDays >= 3 ? 'text-warning' : 'text-text-muted')}
                title={`Waiting: ${waiting}`}
              >
                <Clock3 className="size-3" aria-hidden="true" />
                {waiting}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 t-meta font-display text-text-muted">
              {row.storeName && (
                <span className="inline-flex items-center gap-1">
                  <Store size={11} aria-hidden /> {row.storeName}
                </span>
              )}
              {showDepartment && <span>{row.deptName}</span>}
            </span>
            <span className={cn('inline-flex items-center gap-1 t-meta font-display font-medium', instance.submittedAt ? 'text-text-secondary' : 'text-text-light')}>
              <Send size={11} aria-hidden />
              <span className="truncate">{submitted}</span>
            </span>
          </span>
        </button>

        <ComplianceMeter risk={risk} />

        <RiskChips risk={risk} hideCompliance />

        {instance.items.length > 0 && (
          <button
            type="button"
            aria-expanded={showQuestions}
            onClick={() => setShowQuestions((v) => !v)}
            className="inline-flex h-8 pointer-coarse:h-11 w-fit items-center gap-1 rounded-md t-meta font-display font-semibold text-primary-600 dark:text-primary-300 cursor-pointer outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            <ChevronDown size={14} aria-hidden className={cn('transition-transform duration-150', showQuestions && 'rotate-180')} />
            {showQuestions ? 'Hide questions' : `Show ${instance.items.length} ${instance.items.length === 1 ? 'question' : 'questions'}`}
          </button>
        )}

        {showQuestions && (
          <QuestionPreview
            items={instance.items}
            canRaiseTicket={!!user && !instance.assigneeIds.includes(user.id)}
            onOpen={() => onOpen(id)}
            onSendBackItem={onSendBackItem ? (itemId) => onSendBackItem(id, itemId) : undefined}
          />
        )}

        {inlineActions && (
          <div className={cn('flex items-center justify-end gap-2', lgHidden)}>
            <Button
              size="sm"
              variant="outline"
              className="h-11 px-4 t-meta border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
              onClick={() => onSendBack(id)}
            >
              <CornerUpLeft size={14} aria-hidden />
              Send back
            </Button>
            <Button size="sm" className="h-11 px-4 t-meta bg-success-strong text-white hover:bg-success-strong/90 hover:text-white" onClick={() => onApprove(id)}>
              <Check size={14} aria-hidden />
              Approve
            </Button>
          </div>
        )}
      </div>
    </li>
  );
});

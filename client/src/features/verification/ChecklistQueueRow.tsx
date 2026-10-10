import { memo, useRef, type TouchEvent } from 'react';
import { Check, CornerUpLeft, Repeat, Store } from 'lucide-react';
import { Button } from '../../components';
import { cn } from '@/lib/utils';
import { formatDateTime } from '../checklist/checklistDisplay';
import { RiskChips } from './RiskChips';
import { formatWaiting, type ChecklistRow } from './verificationModel';

const SWIPE_TRIGGER_PX = 96;
const SWIPE_LOCK_PX = 12;

interface ChecklistQueueRowProps {
  row: ChecklistRow;
  now: number;
  /** The row the review pane is showing, or the one the keyboard is on. */
  active: boolean;
  /** Show the department next to the store (off on the department-scoped Approvals page). */
  showDepartment?: boolean;
  /** 'below-lg': the row has its own Approve / Send back buttons only below lg, where the review pane
   *  is not beside it. 'always': the review opens as a sheet at every width, so the row keeps them. */
  inlineActions?: 'below-lg' | 'always';
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onSendBack: (id: string) => void;
}

// One checklist waiting on a reviewer. The title opens it; the chips say whether it is worth
// opening. On a touch screen a swipe right approves (the Undo toast is the confirm step) and a swipe
// left starts a send-back. The buttons stay the main way, a swipe is only a shortcut.
export const ChecklistQueueRow = memo(function ChecklistQueueRow({
  row, now, active, showDepartment = true, inlineActions = 'below-lg', onOpen, onApprove, onSendBack,
}: ChecklistQueueRowProps) {
  const { id, instance, risk } = row;
  const surfaceRef = useRef<HTMLDivElement>(null);
  const approveHintRef = useRef<HTMLDivElement>(null);
  const sendBackHintRef = useRef<HTMLDivElement>(null);
  const gesture = useRef({ x: 0, y: 0, dx: 0, axis: null as 'x' | 'y' | null });

  const paint = (dx: number) => {
    const surface = surfaceRef.current;
    if (surface) surface.style.transform = dx ? `translateX(${dx}px)` : '';
    if (approveHintRef.current) approveHintRef.current.style.opacity = dx > 0 ? String(Math.min(1, dx / SWIPE_TRIGGER_PX)) : '0';
    if (sendBackHintRef.current) sendBackHintRef.current.style.opacity = dx < 0 ? String(Math.min(1, -dx / SWIPE_TRIGGER_PX)) : '0';
  };

  const onTouchStart = (e: TouchEvent) => {
    // A touch laptop at lg has the review pane and keyboard keys beside the list: no swipe there.
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
    ? `${instance.submittedByName ? `Submitted by ${instance.submittedByName}, ` : 'Submitted '}${formatDateTime(instance.submittedAt)}`
    : null;

  return (
    <li className="relative rounded-xl">
      {/* Shown behind the row while it is dragged on a touch screen. */}
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
          'relative flex flex-col gap-3 p-3 sm:p-4 rounded-xl border bg-surface touch-pan-y transition-[border-color,background-color] duration-150',
          active ? 'border-border-hover' : 'border-border/60 hover:border-border-hover',
          risk.criticalFailed > 0 && !active && 'border-danger/40',
        )}
      >
        {/* The press scale sits on the button, not the row: the row's transform is the swipe. */}
        <button
          type="button"
          data-queue-row={id}
          aria-current={active ? 'true' : undefined}
          onClick={() => onOpen(id)}
          className="flex items-start gap-3 min-w-0 text-left cursor-pointer outline-none rounded-md transition-transform duration-150 ease-out active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <Repeat size={16} aria-hidden className="mt-0.5 shrink-0 text-text-light" />
          <span className="flex flex-col gap-1 min-w-0 flex-1">
            <span className="flex items-start justify-between gap-3">
              <span className={cn('t-card font-display text-text leading-snug line-clamp-2', active ? 'font-bold' : 'font-semibold')}>
                {instance.title}
              </span>
              <span
                className={cn('shrink-0 t-meta font-display font-medium tabular-nums', waitingDays >= 3 ? 'text-warning' : 'text-text-muted')}
                title={`Waiting: ${waiting}`}
              >
                {waiting}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 t-meta font-display text-text-muted">
              {row.storeName && (
                <span className="inline-flex items-center gap-1">
                  <Store size={12} aria-hidden /> {row.storeName}
                </span>
              )}
              {showDepartment && <span>{row.deptName}</span>}
              {submitted && <span>{submitted}</span>}
            </span>
          </span>
        </button>

        <RiskChips risk={risk} />

        {inlineActions && (
          <div className={cn('flex items-center justify-end gap-2', lgHidden)}>
            <Button
              size="sm"
              variant="outline"
              className="border-danger/30 text-danger hover:bg-danger/10 hover:border-danger/50 hover:text-danger"
              onClick={() => onSendBack(id)}
            >
              <CornerUpLeft size={14} aria-hidden />
              Send back
            </Button>
            <Button size="sm" className="bg-success-strong text-white hover:bg-success-strong/90 hover:text-white" onClick={() => onApprove(id)}>
              <Check size={14} aria-hidden />
              Approve
            </Button>
          </div>
        )}
      </div>
    </li>
  );
});

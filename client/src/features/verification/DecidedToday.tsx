import { memo, useCallback, useMemo } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Clock, CornerUpLeft, History, ListChecks, MessageSquare, RotateCcw, Send, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, EmptyState, InlineError, useConfirm, ApprovalStatusChip, VerifiedByChip } from '../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TD_CLASS, TableSkeleton } from '../../components/dataTable';
import { useCanReopen } from '../checklist/instance/useCanReopen';
import { useReopenApprovalMutation } from '../checklist/hook';
import { useChecklistDecisionsQuery, type ChecklistDecision } from './useChecklistDecisions';

const ACTION_CHIP: Record<ChecklistDecision['action'], { label: string; icon: typeof Send; tone: string }> = {
  APPROVE: { label: 'Approved', icon: CheckCircle2, tone: 'bg-success' },
  REJECT: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SEND_BACK: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SUBMIT: { label: 'Submitted', icon: Send, tone: 'bg-primary-600' },
};

// Desktop (lg+) freezes the first three columns. Offsets are the summed widths of the frozen columns
// before them, written as lg-only classes so phones keep a plain scrolling table. Phones show
// initials, short times and a status dot; the full words come back as tooltips.
const FREEZE = {
  checklist: 'lg:left-0',
  by: 'lg:left-[12.5rem]',
  when: 'lg:left-[22rem]',
} as const;

// From xl up the table fits without scrolling, so nothing is frozen and the Checklist title takes the
// spare width (`xl:w-auto`) rather than an empty Note column stretching out.
const COL_CLASS = [
  'lg:w-[12.5rem] xl:w-auto',
  'w-14 lg:w-[9.5rem] xl:w-[11rem]',
  'w-16 lg:w-[8rem] xl:w-[9.5rem]',
  'w-12 lg:w-[6.5rem] xl:w-[8rem]',
  'hidden lg:table-column lg:w-[5.5rem] xl:w-[6.5rem]',
  'hidden xl:table-column xl:w-[16rem]',
  'w-12 lg:w-[7rem] xl:w-[7rem]',
] as const;
const UNFREEZE = 'xl:static';

const PAD = 'px-2 lg:px-3';
// Sticky cells need an opaque background so scrolling content slides underneath them, and the
// lg-only `sticky` keeps phones on a normal flow. Never pair `relative` with `sticky`: tailwind-merge
// keeps the later one, which turns the frozen cell into a plain offset box.
const STICKY_CELL = 'lg:sticky xl:static z-10 bg-surface transition-colors group-hover:bg-surface-hover';
const FROZEN_EDGE = 'lg:shadow-[6px_0_6px_-6px_rgb(0_0_0/0.22)] xl:shadow-none';
// Row dividers sit on the cells (border-separate): an opaque sticky background would cover a
// collapsed row border and leave gaps in the frozen columns.
const CELL_TIGHT = 'py-1.5 pointer-coarse:py-2 border-t border-border/60';
const ROW_CELL = cn(TD_CLASS, PAD, CELL_TIGHT, 'border-l border-border/40 transition-colors group-hover:bg-surface-hover');

const TIME_ONLY = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
const DAY_TIME = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
const FULL_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

const parseAt = (value: string): Date | null => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

interface DecisionRowProps {
  decision: ChecklistDecision;
  canReopen: boolean;
  reopening: boolean;
  onReopen: (decision: ChecklistDecision) => void;
}

const DecisionRow = memo(function DecisionRow({ decision, canReopen, reopening, onReopen }: DecisionRowProps) {
  const chip = ACTION_CHIP[decision.action];
  const statusKey = decision.action === 'APPROVE' ? 'APPROVED' : decision.action === 'SUBMIT' ? 'SUBMITTED' : 'REJECTED';
  const at = parseAt(decision.at);
  const who = decision.actorName?.trim() || null;
  const questions = decision.itemCount ?? 0;
  const questionsLabel = `${questions} ${questions === 1 ? 'question' : 'questions'}`;

  return (
    <tr className="group">
      <th scope="row" className={cn(TD_CLASS, PAD, CELL_TIGHT, STICKY_CELL, FREEZE.checklist, 'min-w-0 text-left font-normal')}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <Link
            to={`/checklists/${decision.instanceId}`}
            title={decision.title}
            className="t-card font-display font-semibold text-text truncate rounded-sm hover:underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            {decision.title}
          </Link>
          <span className="flex min-w-0 items-center gap-1.5 t-meta text-text-muted">
            {decision.storeName && <span className="truncate">{decision.storeName}</span>}
            {questions > 0 && <span className="shrink-0 tabular-nums lg:hidden">· {questionsLabel}</span>}
            {decision.note && (
              <span role="img" aria-label={`Note: ${decision.note}`} title={decision.note} className="shrink-0 xl:hidden">
                <MessageSquare className="size-3" aria-hidden />
              </span>
            )}
          </span>
        </div>
      </th>

      <td className={cn(ROW_CELL, STICKY_CELL, FREEZE.by)}>
        {who ? (
          <>
            <span role="img" aria-label={`Approved by ${who}`} title={who} className="flex size-7 items-center justify-center rounded-full bg-primary-500/15 t-meta font-display font-bold text-primary-700 dark:text-primary-300 lg:hidden">
              {initialsOf(who)}
            </span>
            <span className="max-lg:hidden">
              <VerifiedByChip verifierName={who} showLabel={false} />
            </span>
          </>
        ) : (
          <span className="text-text-light">-</span>
        )}
      </td>

      <td className={cn(ROW_CELL, STICKY_CELL, FREEZE.when, FROZEN_EDGE, 'whitespace-nowrap tabular-nums')}>
        {at ? (
          <time dateTime={at.toISOString()} title={FULL_DATE.format(at)} className="flex items-center gap-1.5 text-text">
            <Clock className="size-3 shrink-0 text-text-muted" aria-hidden />
            <span className="lg:hidden">{TIME_ONLY.format(at)}</span>
            <span className="max-lg:hidden">{DAY_TIME.format(at)}</span>
          </time>
        ) : (
          <span className="text-text-light">-</span>
        )}
      </td>

      <td className={ROW_CELL}>
        <ApprovalStatusChip status={statusKey} label={<span className="max-lg:sr-only">{chip.label}</span>} title={chip.label} />
      </td>

      <td className={cn(ROW_CELL, 'hidden lg:table-cell')}>
        {questions > 0 ? (
          <span title={questionsLabel} className="inline-flex items-center gap-1 t-meta font-semibold tabular-nums text-text">
            <ListChecks className="size-3 text-text-muted" aria-hidden />
            {questions}
          </span>
        ) : (
          <span className="text-text-light">-</span>
        )}
      </td>

      <td className={cn(ROW_CELL, 'hidden xl:table-cell')}>
        {decision.note ? (
          <span title={decision.note} className="line-clamp-2 break-words t-meta text-text-secondary">{decision.note}</span>
        ) : (
          <span className="text-text-light">-</span>
        )}
      </td>

      <td className={cn(ROW_CELL, 'text-right')}>
        {canReopen && decision.action === 'APPROVE' && (
          <Button
            size="sm"
            variant="outline"
            className="px-2 lg:px-3"
            title="Reopen"
            aria-label={`Reopen ${decision.title}`}
            isLoading={reopening}
            onClick={() => onReopen(decision)}
          >
            {!reopening && <RotateCcw size={14} aria-hidden />}
            <span className="max-lg:sr-only">Reopen</span>
          </Button>
        )}
      </td>
    </tr>
  );
});

interface DecidedTodayProps {
  onShowWaiting?: () => void;
  waitingIds?: ReadonlySet<string>;
}

export const DecidedToday = ({ onShowWaiting, waitingIds }: DecidedTodayProps) => {
  const { data, isPending, isError, refetch } = useChecklistDecisionsQuery();
  const canReopen = useCanReopen();
  const confirm = useConfirm();
  const reopen = useReopenApprovalMutation();
  const { mutate } = reopen;

  const decisions = useMemo(
    () => (data ?? []).filter((d) => d.action !== 'SUBMIT').sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [data],
  );
  const latestApproval = useMemo(() => {
    const seen = new Set<string>();
    const ids = new Set<string>();
    for (const d of decisions) {
      if (d.action !== 'APPROVE' || seen.has(d.instanceId)) continue;
      seen.add(d.instanceId);
      ids.add(d.id);
    }
    return ids;
  }, [decisions]);

  const onReopen = useCallback(async (decision: ChecklistDecision) => {
    const ok = await confirm({
      title: 'Reopen this approval?',
      description: `"${decision.title}" goes back to the waiting list so it can be reviewed again.`,
      confirmLabel: 'Reopen',
    });
    if (ok) mutate(decision.instanceId);
  }, [confirm, mutate]);

  if (isError && !data) {
    return <InlineError message="We couldn't load today's decisions. Check your connection and try again." onRetry={() => refetch()} />;
  }

  if (isPending) {
    return <TableSkeleton rows={4} label="Loading approval history" />;
  }

  if (decisions.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No decisions yet today"
        description="Approved and sent back checklists show up here as you work through the pending list above."
        action={onShowWaiting ? { label: 'Back to the waiting list', onClick: onShowWaiting, icon: Undo2 } : undefined}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isError && <InlineError message="Showing the last list we loaded. The refresh failed." onRetry={() => refetch()} />}

      <div className={cn(TABLE_FRAME_CLASS, 'max-h-none lg:max-h-[min(60svh,28rem)]')}>
        <table className="w-full table-fixed border-separate border-spacing-0 text-left">
          <caption className="sr-only">Today's approval history</caption>
          <colgroup>
            {COL_CLASS.map((c, i) => <col key={i} className={c} />)}
          </colgroup>
          <thead className="sticky top-0 z-20">
            <tr>
              <th scope="col" className={cn(TH_CLASS, PAD, FREEZE.checklist, UNFREEZE, 'lg:z-30')}>Checklist</th>
              <th scope="col" className={cn(TH_CLASS, PAD, FREEZE.by, UNFREEZE, 'lg:z-30 border-l border-primary-900/40')}>
                <span className="lg:hidden">By</span>
                <span className="max-lg:hidden">Approved by</span>
              </th>
              <th scope="col" className={cn(TH_CLASS, PAD, FREEZE.when, FROZEN_EDGE, UNFREEZE, 'lg:z-30 border-l border-primary-900/40')}>
                <span className="lg:hidden">When</span>
                <span className="max-lg:hidden">Date &amp; time</span>
              </th>
              <th scope="col" className={cn(TH_CLASS, PAD, 'border-l border-primary-700/40')}>Result</th>
              <th scope="col" className={cn(TH_CLASS, PAD, 'hidden lg:table-cell border-l border-primary-700/40')}>Questions</th>
              <th scope="col" className={cn(TH_CLASS, PAD, 'hidden xl:table-cell border-l border-primary-700/40')}>Note</th>
              <th scope="col" className={cn(TH_CLASS, PAD, 'border-l border-primary-700/40')}><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {decisions.map((d) => (
              <DecisionRow
                key={d.id}
                decision={d}
                canReopen={canReopen && latestApproval.has(d.id) && !waitingIds?.has(d.instanceId)}
                reopening={reopen.isPending && reopen.variables === d.instanceId}
                onReopen={onReopen}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

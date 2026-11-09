import { memo, useMemo } from 'react';
import { Link } from 'react-router';
import { AlarmClockOff, CalendarClock, CheckCircle2, ChevronRight, CircleDashed, Clock, Store, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../../components';
import { useSharedNow } from '../../../lib/useSharedNow';
import { formatPeriodSpan, getInstanceView } from '../checklistDisplay';
import type { ChecklistInstance } from '../../../api/checklistInstances';

type StoreState = 'done' | 'progress' | 'todo' | 'missed' | 'opens' | 'none';

const STATE_LOOK: Record<StoreState, { icon: LucideIcon; text: string; tile: string }> = {
  done: { icon: CheckCircle2, text: 'text-success', tile: 'bg-success/12 text-success' },
  progress: { icon: Clock, text: 'text-primary-700 dark:text-primary-300', tile: 'bg-primary-500/12 text-primary-700 dark:text-primary-300' },
  todo: { icon: CircleDashed, text: 'text-text-secondary', tile: 'bg-surface-hover text-text-muted' },
  missed: { icon: AlarmClockOff, text: 'text-danger', tile: 'bg-danger/12 text-danger' },
  opens: { icon: CalendarClock, text: 'text-text-secondary', tile: 'bg-surface-hover text-text-muted' },
  none: { icon: CircleDashed, text: 'text-text-muted', tile: 'bg-surface-hover text-text-light' },
};

interface StoreRow {
  storeId: string;
  name: string;
  state: StoreState;
  label: string;
  period: string | null;
  href: string | null;
  recentDone: number;
  recentTotal: number;
}

const summarize = (storeId: string, name: string, runs: ChecklistInstance[], now: number): StoreRow => {
  if (!runs.length) {
    return { storeId, name, state: 'none', label: 'No run yet', period: null, href: null, recentDone: 0, recentTotal: 0 };
  }
  const views = runs.map((run) => ({ run, view: getInstanceView(run, now) }));
  const recentDone = views.filter((v) => v.view.isComplete).length;
  const latestStart = Math.max(...runs.map((r) => new Date(r.periodStart).getTime()));
  const current = views.filter((v) => new Date(v.run.periodStart).getTime() === latestStart);
  const doneNow = current.filter((v) => v.view.isComplete).length;
  const first = current[0]!;
  const open = current.find((v) => !v.view.isComplete) ?? first;
  const href = `/checklists/${open.run.id}`;
  const period = formatPeriodSpan(first.run);
  const base = { storeId, name, period, href, recentDone, recentTotal: runs.length };

  if (doneNow === current.length) {
    return { ...base, state: 'done', label: current.length > 1 ? `Done, all ${current.length}` : 'Done' };
  }
  if (current.every((v) => v.view.isComplete || v.view.closed)) {
    return { ...base, state: 'missed', label: current.length > 1 ? `Missed, ${doneNow} of ${current.length} done` : 'Missed' };
  }
  const opensOn = current.find((v) => v.view.opensOn)?.view.opensOn;
  if (opensOn && doneNow === 0 && current.every((v) => v.view.done === 0)) {
    return { ...base, state: 'opens', label: `Opens ${opensOn}` };
  }
  if (current.length > 1) {
    const started = doneNow > 0 || current.some((v) => v.view.done > 0);
    return { ...base, state: started ? 'progress' : 'todo', label: `${doneNow} of ${current.length} done` };
  }
  const { done, total } = first.view;
  return done > 0
    ? { ...base, state: 'progress', label: `In progress, ${done} of ${total}` }
    : { ...base, state: 'todo', label: 'Not started' };
};

interface StoreCompletionListProps {
  storeIds: string[];
  storeNameById: Map<string, string> | null;
  instances: ChecklistInstance[];
}

export const StoreCompletionList = memo(function StoreCompletionList({ storeIds, storeNameById, instances }: StoreCompletionListProps) {
  const now = useSharedNow();
  const rows = useMemo(() => {
    const byStore = new Map<string, ChecklistInstance[]>();
    for (const run of instances) {
      if (!run.storeId) continue;
      const list = byStore.get(run.storeId) ?? [];
      list.push(run);
      byStore.set(run.storeId, list);
    }
    return storeIds
      .map((id) => summarize(id, storeNameById?.get(id) ?? 'Store', byStore.get(id) ?? [], now))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [storeIds, storeNameById, instances, now]);

  const doneCount = rows.filter((r) => r.state === 'done').length;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="by-store-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="by-store-heading" className="t-card font-display font-bold text-text">By store</h2>
        <p className="t-meta font-display text-text-muted tabular-nums">
          {doneCount} of {rows.length} stores done on their latest run. Each store fills its own copy.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const look = STATE_LOOK[row.state];
          const Icon = look.icon;
          const body = (
            <>
              <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', look.tile)} aria-hidden="true">
                <Icon size={17} strokeWidth={2.25} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Store size={13} className="shrink-0 text-text-muted" aria-hidden="true" />
                  <span className="t-card font-display font-semibold text-text line-clamp-2 leading-snug break-words">{row.name}</span>
                </span>
                <span className={cn('t-meta font-display font-semibold', look.text)}>{row.label}</span>
                <span className="t-meta text-text-muted tabular-nums">
                  {row.period ? `${row.period}. ` : ''}
                  {row.recentTotal > 0 ? `${row.recentDone} of ${row.recentTotal} recent runs done` : 'Nothing to fill yet'}
                </span>
              </span>
              {row.href && <ChevronRight size={16} className="shrink-0 text-text-light" aria-hidden="true" />}
            </>
          );
          return (
            <li key={row.storeId}>
              {row.href ? (
                <Link
                  to={row.href}
                  viewTransition
                  aria-label={`${row.name}: ${row.label}. Open this store's run`}
                  className={cn(
                    PANEL_CLASS,
                    'flex min-h-11 items-center gap-3 p-3 outline-none transition-[border-color,transform] duration-150 ease-out hover:border-border-hover active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
                    row.state === 'missed' && 'border-danger/40',
                  )}
                >
                  {body}
                </Link>
              ) : (
                <div className={cn(PANEL_CLASS, 'flex items-center gap-3 p-3')}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
});

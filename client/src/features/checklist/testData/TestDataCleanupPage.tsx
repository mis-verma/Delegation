import { useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarRange, Check, ClipboardX, ListChecks, Trash2, Users } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Avatar, Button, EmptyState, PageHeader, PANEL_CLASS, Pill, Skeleton, Textarea } from '../../../components';
import { DateRangePicker, type DateRangeValue } from '../../../components/dateRangePicker';
import { useConfirm } from '@/components/confirmDialog';
import { cn } from '@/lib/utils';
import { checklistInstanceApi, type TestRunFilter } from '../../../api/checklistInstances';
import { errorMessage } from '../../../lib/queryHelpers';
import { useDeleteTestRunsMutation } from '../hook';
import { formatDate, VERIFICATION_STATUS_LABEL } from '../checklistDisplay';
import { ChecklistMultiPicker } from './ChecklistMultiPicker';

const EMPTY_IDS: ReadonlySet<string> = new Set<string>();

const pad = (n: number) => String(n).padStart(2, '0');
const dayString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const Field = ({ icon: Icon, label, hint, children }: { icon: typeof Users; label: string; hint?: string; children: ReactNode }) => (
  <div className="flex flex-col gap-2">
    <span className="inline-flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
      <Icon size={14} className="text-text-light" aria-hidden />
      {label}
    </span>
    {children}
    {hint && <span className="t-meta text-text-muted">{hint}</span>}
  </div>
);

export const TestDataCleanupPage = () => {
  const confirm = useConfirm();
  const remove = useDeleteTestRunsMutation();
  const [definitionIds, setDefinitionIds] = useState<string[]>([]);
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const [unticked, setUnticked] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: '', ids: new Set() });
  const [reason, setReason] = useState('');

  const days = {
    ...(range.from ? { fromDate: dayString(range.from) } : {}),
    ...(range.to ? { toDate: dayString(range.to) } : {}),
  };
  const scope = { ...(definitionIds.length ? { definitionIds } : {}), ...days };
  const scopeKey = JSON.stringify(scope);
  const hasScope = definitionIds.length > 0 || !!range.to;

  const { data: checklists, isLoading: loadingChecklists } = useQuery({
    queryKey: ['checklist-instances', 'cleanup-checklists'] as const,
    queryFn: () => checklistInstanceApi.cleanupChecklists(),
    staleTime: 60_000,
  });

  const people = useQuery({
    queryKey: ['checklist-instances', 'cleanup-people', scopeKey] as const,
    queryFn: () => checklistInstanceApi.cleanupPeople(scope),
    enabled: hasScope,
    staleTime: 30_000,
  });

  const excluded: ReadonlySet<string> = unticked.key === scopeKey ? unticked.ids : EMPTY_IDS;
  const setExcluded = (ids: ReadonlySet<string>) => setUnticked({ key: scopeKey, ids });

  const allPeople = hasScope ? people.data ?? [] : [];
  const pickedIds = allPeople.filter((p) => !excluded.has(p.id)).map((p) => p.id);
  const filter: TestRunFilter = { ...scope, userIds: pickedIds };
  const filterKey = JSON.stringify(filter);
  const ready = hasScope && !!people.data && pickedIds.length > 0;

  const preview = useQuery({
    queryKey: ['checklist-instances', 'cleanup-preview', filterKey] as const,
    queryFn: () => checklistInstanceApi.previewTestRuns(filter),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
  const result = ready && preview.data && !preview.isPlaceholderData ? preview.data : null;

  const togglePerson = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExcluded(next);
  };
  const everyone = excluded.size === 0;

  const canDelete = !!result && result.total > 0 && reason.trim().length >= 3 && !remove.isPending && !preview.isFetching;

  const doDelete = async () => {
    if (!result || !canDelete) return;
    const ok = await confirm({
      title: `Delete ${result.total} ${result.total === 1 ? 'run' : 'runs'} for good?`,
      description: `Answers, photos and scores of these runs are removed, so they stop counting in reports.${everyone ? '' : ' Runs shared with anyone you left unticked stay.'} This cannot be undone.`,
      confirmLabel: `Delete ${result.total}`,
      cancelLabel: 'Keep them',
      variant: 'danger',
    });
    if (!ok) return;
    remove.mutate(
      { ...filter, expectedCount: result.total, reason: reason.trim() },
      { onSuccess: () => { setReason(''); void people.refetch(); } },
    );
  };

  return (
    <div className="view-enter flex flex-col gap-4 sm:gap-5 pt-2.5 w-full max-w-3xl mx-auto">
      <PageHeader icon={ClipboardX} title="Remove old runs" subtitle="Delete checklist runs from earlier days or from test accounts, so they stop counting in scores and reports." />

      <section className={cn(PANEL_CLASS, 'flex flex-col gap-5 p-4 sm:p-5')} aria-label="What to remove">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field icon={ListChecks} label="Checklist">
            <ChecklistMultiPicker checklists={checklists ?? []} selectedIds={definitionIds} onChange={setDefinitionIds} isLoading={loadingChecklists} />
          </Field>
          <Field icon={CalendarRange} label="Days">
            <DateRangePicker value={range} onChange={setRange} placeholder="Every day" />
          </Field>
        </div>

        {!hasScope ? (
          <p className="t-meta text-text-muted">Pick a checklist or some days to see who filled it in.</p>
        ) : (
          <Field icon={Users} label="People" hint="Everyone who filled these runs is ticked. Untick anyone whose runs you want to keep.">
            {people.isLoading ? (
              <div className="flex flex-wrap gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-40 rounded-xl" />)}</div>
            ) : people.isError ? (
              <p role="alert" className="t-meta font-semibold text-danger">{errorMessage(people.error, "Couldn't load the people. Try again.")}</p>
            ) : allPeople.length === 0 ? (
              <p className="t-meta text-text-muted">Nobody has a run here.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3 t-meta font-display font-semibold">
                  <button type="button" className="text-primary-700 hover:underline cursor-pointer dark:text-primary-300" onClick={() => setExcluded(new Set())}>Tick all</button>
                  <button type="button" className="text-text-secondary hover:underline cursor-pointer" onClick={() => setExcluded(new Set(allPeople.map((p) => p.id)))}>Untick all</button>
                  <span className="text-text-muted">{pickedIds.length} of {allPeople.length} picked</span>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2" aria-label="People">
                  {allPeople.map((p) => {
                    const on = !excluded.has(p.id);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => togglePerson(p.id)}
                          className={cn(
                            'flex w-full min-h-12 items-center gap-3 rounded-xl border px-3 py-2 text-left cursor-pointer outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40',
                            on ? 'border-danger/40 bg-danger/5' : 'border-border/60 bg-surface hover:border-border-hover',
                          )}
                        >
                          <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md border', on ? 'border-danger bg-danger text-white' : 'border-border-hover text-transparent')} aria-hidden>
                            <Check size={13} strokeWidth={3} />
                          </span>
                          <Avatar name={p.name} size="sm" />
                          <span className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate t-card font-display font-semibold text-text">{p.name}{p.isActive ? '' : ' (left)'}</span>
                            <span className="t-meta text-text-muted tabular-nums">{p.runs} {p.runs === 1 ? 'run' : 'runs'}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </Field>
        )}
      </section>

      <section className={cn(PANEL_CLASS, 'flex flex-col gap-3 p-4 sm:p-5')} aria-label="What will be removed" aria-live="polite">
        <h2 className="t-section font-display font-bold text-text">What will be removed</h2>
        {!ready ? (
          <p className="t-meta text-text-muted">{hasScope ? 'Tick at least one person.' : 'Pick a checklist or some days first.'}</p>
        ) : preview.isError ? (
          <p role="alert" className="t-meta font-semibold text-danger">{errorMessage(preview.error, "Couldn't count the runs. Try again.")}</p>
        ) : !result ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : result.total === 0 ? (
          <EmptyState size="compact" icon={ClipboardX} title="Nothing to remove" description="No runs match these choices." className="border-0" />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <span className="text-3xl font-display font-bold tabular-nums text-danger">{result.total}</span>
              <span className="t-card font-display font-semibold text-text">{result.total === 1 ? 'run' : 'runs'}</span>
              <div className="flex flex-wrap gap-1.5">
                {result.approved > 0 && <Pill tone="success">{result.approved} approved</Pill>}
                {result.pending > 0 && <Pill tone="info">{result.pending} waiting for approval</Pill>}
                {result.notSubmitted > 0 && <Pill>{result.notSubmitted} not submitted</Pill>}
              </div>
            </div>
            <ul className="flex flex-col divide-y divide-border/50 rounded-xl border border-border/60" aria-label="Latest runs">
              {result.sample.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="min-w-0 truncate t-card font-display font-medium text-text">{r.title}</span>
                  <span className="shrink-0 t-meta text-text-muted">{formatDate(r.periodStart)} · {VERIFICATION_STATUS_LABEL[r.verificationStatus]}</span>
                </li>
              ))}
            </ul>
            {result.total > result.sample.length && <p className="t-meta text-text-muted">Showing the latest {result.sample.length}.</p>}
          </>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger/5 p-4 sm:p-5" aria-label="Delete">
        <p className="flex items-start gap-2 t-meta text-text">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden />
          <span><span className="font-semibold">Deleting is permanent.</span> Only admins can do this, and the reason is kept in the audit log.</span>
        </p>
        <Textarea
          id="cleanup-reason"
          label="Why"
          labelClassName="font-display font-medium"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Test runs from before we went live"
          className="min-h-0 resize-none rounded-lg px-3 py-2"
        />
        <Button
          variant="danger"
          className="w-full gap-1.5 font-display sm:w-fit pointer-coarse:h-12"
          disabled={!canDelete}
          isLoading={remove.isPending}
          onClick={() => void doDelete()}
        >
          {!remove.isPending && <Trash2 size={15} aria-hidden />}
          {result && result.total > 0 ? `Delete ${result.total} ${result.total === 1 ? 'run' : 'runs'}` : 'Delete'}
        </Button>
      </section>
    </div>
  );
};

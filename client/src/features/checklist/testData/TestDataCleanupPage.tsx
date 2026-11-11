import { useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CalendarRange, ClipboardX, FlaskConical, ListChecks, ScanSearch, Trash2, Users } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, NoticeBanner, PageHeader, PANEL_CLASS, Pill, Textarea, ToggleChip } from '../../../components';
import { DateRangePicker, type DateRangeValue } from '../../../components/dateRangePicker';
import { useConfirm } from '@/components/confirmDialog';
import { AssigneeField } from '../../assignees/AssigneeField';
import { useUsersQuery } from '../../admin/hook';
import { checklistInstanceApi, type TestRunFilter, type TestRunPreview } from '../../../api/checklistInstances';
import type { AssignableUser } from '../../../api/users';
import { errorMessage } from '../../../lib/queryHelpers';
import { useDeleteTestRunsMutation } from '../hook';
import { formatDate, VERIFICATION_STATUS_LABEL } from '../checklistDisplay';
import { ChecklistMultiPicker } from './ChecklistMultiPicker';

const DAY_MS = 86_400_000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const PRESETS = [
  { key: 'before-today', label: 'Every day before today', range: () => ({ from: null, to: startOfToday() }) },
  { key: 'last-7', label: 'Last 7 days', range: () => ({ from: new Date(startOfToday().getTime() - 7 * DAY_MS), to: startOfToday() }) },
  { key: 'last-30', label: 'Last 30 days', range: () => ({ from: new Date(startOfToday().getTime() - 30 * DAY_MS), to: startOfToday() }) },
] as const;

const Step = ({ n, icon: Icon, title, children }: { n: number; icon: typeof Users; title: string; children: ReactNode }) => (
  <section className={`${PANEL_CLASS} flex flex-col gap-3 p-4 sm:p-5`} aria-label={title}>
    <h2 className="flex items-center gap-2 t-section font-display font-bold text-text">
      <span className="flex size-7 items-center justify-center rounded-full bg-primary-500/10 t-meta font-bold text-primary-700 dark:text-primary-300" aria-hidden>{n}</span>
      <Icon size={16} className="text-text-light" aria-hidden />
      {title}
    </h2>
    {children}
  </section>
);

export const TestDataCleanupPage = () => {
  const confirm = useConfirm();
  const { data: allUsers, isLoading } = useUsersQuery();
  const [userIds, setUserIds] = useState<string[]>([]);
  const [definitionIds, setDefinitionIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<string | null>(null);
  const { data: checklists, isLoading: loadingChecklists } = useQuery({
    queryKey: ['checklist-instances', 'cleanup-checklists'] as const,
    queryFn: () => checklistInstanceApi.cleanupChecklists(),
    staleTime: 60_000,
  });
  const [range, setRange] = useState<DateRangeValue>({ from: null, to: null });
  const [reason, setReason] = useState('');
  const [checked, setChecked] = useState<{ key: string; result: TestRunPreview } | null>(null);
  const remove = useDeleteTestRunsMutation();

  const people = useMemo<AssignableUser[]>(
    () => (allUsers ?? []).map((u) => ({ id: u.id, firstName: u.firstName, lastName: u.lastName, email: u.email, role: u.role, departmentId: u.departmentId })),
    [allUsers],
  );

  const filter: TestRunFilter = {
    ...(userIds.length ? { userIds } : {}),
    ...(definitionIds.length ? { definitionIds } : {}),
    ...(range.from ? { from: range.from.toISOString() } : {}),
    ...(range.to ? { to: range.to.toISOString() } : {}),
  };
  const filterKey = JSON.stringify(filter);
  const preview = checked?.key === filterKey ? checked.result : null;

  const check = useMutation({
    mutationFn: () => checklistInstanceApi.previewTestRuns(filter),
    onSuccess: (result) => setChecked({ key: filterKey, result }),
  });

  const names = people.filter((p) => userIds.includes(p.id)).map((p) => p.firstName).join(', ');
  const hasScope = userIds.length > 0 || definitionIds.length > 0 || !!range.to;
  const pickPreset = (key: string) => {
    const found = PRESETS.find((p) => p.key === key);
    if (!found) return;
    setPreset(key);
    setRange(found.range());
  };
  const canDelete = !!preview && preview.total > 0 && reason.trim().length >= 3 && !remove.isPending;

  const doDelete = async () => {
    if (!preview || !canDelete) return;
    const ok = await confirm({
      title: `Delete ${preview.total} ${preview.total === 1 ? 'run' : 'runs'} for good?`,
      description: `${userIds.length ? `Every matching run that only ${names || 'these people'} worked on is removed. Runs shared with anyone else stay.` : 'Every matching run is removed for everyone on it.'} Answers, photos and scores go with them, so they stop counting. This cannot be undone.`,
      confirmLabel: `Delete ${preview.total}`,
      cancelLabel: 'Keep them',
      variant: 'danger',
    });
    if (!ok) return;
    remove.mutate(
      { ...filter, expectedCount: preview.total, reason: reason.trim() },
      { onSuccess: () => { setChecked(null); setReason(''); } },
    );
  };

  return (
    <div className="view-enter flex flex-col gap-4 sm:gap-5 pt-2.5 w-full max-w-3xl mx-auto">
      <PageHeader icon={FlaskConical} title="Remove old runs" subtitle="Delete checklist runs from earlier days or from test accounts, so they stop counting in scores and reports." />

      <NoticeBanner tone="warning" icon={AlertTriangle}>
        <span className="font-semibold">Admin only. Deleting is permanent.</span> Narrow it down with checklists, days and people, then check what matches before you delete.
      </NoticeBanner>

      <Step n={1} icon={ListChecks} title="Which checklists">
        <ChecklistMultiPicker checklists={checklists ?? []} selectedIds={definitionIds} onChange={setDefinitionIds} isLoading={loadingChecklists} />
        <p className="t-meta text-text-muted">Leave it on Every checklist to include all of them.</p>
      </Step>

      <Step n={2} icon={CalendarRange} title="Which days">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick day ranges">
          {PRESETS.map((p) => (
            <ToggleChip key={p.key} on={preset === p.key} onClick={() => pickPreset(p.key)}>{p.label}</ToggleChip>
          ))}
        </div>
        <DateRangePicker value={range} onChange={(next) => { setPreset(null); setRange(next); }} placeholder="Every day" />
        <p className="t-meta text-text-muted">Today is never included by the quick options. Leave the days empty only when you also pick checklists or people.</p>
      </Step>

      <Step n={3} icon={Users} title="Only these people (optional)">
        <AssigneeField
          hideLabel
          selectedIds={userIds}
          onChange={setUserIds}
          users={people}
          isLoading={isLoading}
          emptyText="No people found."
        />
        <p className="t-meta text-text-muted">Use this for test accounts. Only runs where everyone on it is someone you pick are removed. Leave it empty to remove runs for everyone.</p>
      </Step>

      <Step n={4} icon={ScanSearch} title="Check what would go">
        <Button
          variant="outline"
          className="w-fit gap-1.5 font-display pointer-coarse:h-11"
          disabled={!hasScope}
          isLoading={check.isPending}
          onClick={() => check.mutate()}
        >
          {!check.isPending && <ScanSearch size={15} aria-hidden />}
          {preview ? 'Check again' : 'Check'}
        </Button>
        {check.isError && <p role="alert" className="t-meta font-display font-semibold text-danger">{errorMessage(check.error, "Couldn't check. Try again.")}</p>}
        {!hasScope && <p className="t-meta text-text-muted">Pick some checklists, some days or some people first.</p>}
        {checked && !preview && <p className="t-meta text-text-muted">You changed what to include. Check again.</p>}
        {preview && (
          preview.total === 0 ? (
            <p className="flex items-center gap-2 t-card font-display text-text-secondary"><ClipboardX size={16} aria-hidden /> Nothing to delete for these people and days.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill tone="danger">{preview.total} {preview.total === 1 ? 'run' : 'runs'}</Pill>
                {preview.approved > 0 && <Pill tone="success">{preview.approved} approved</Pill>}
                {preview.pending > 0 && <Pill tone="info">{preview.pending} waiting for approval</Pill>}
                {preview.notSubmitted > 0 && <Pill>{preview.notSubmitted} not submitted</Pill>}
              </div>
              <ul className="flex flex-col divide-y divide-border/50 rounded-lg border border-border/60" aria-label="Some of the runs">
                {preview.sample.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate t-card font-display font-medium text-text">{r.title}</span>
                    <span className="shrink-0 t-meta text-text-muted">{formatDate(r.periodStart)} · {VERIFICATION_STATUS_LABEL[r.verificationStatus]}</span>
                  </li>
                ))}
              </ul>
              {preview.total > preview.sample.length && <p className="t-meta text-text-muted">Showing the latest {preview.sample.length}.</p>}
            </div>
          )
        )}
      </Step>

      <Step n={5} icon={Trash2} title="Delete">
        <Textarea
          id="test-data-reason"
          label="Why (kept in the audit log)"
          labelClassName="font-display font-medium"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="e.g. Test account used while setting up the store checklists"
          className="min-h-0 resize-none rounded-lg px-3 py-2"
        />
        <Button
          variant="danger"
          className="w-fit gap-1.5 font-display pointer-coarse:h-11"
          disabled={!canDelete}
          isLoading={remove.isPending}
          onClick={() => void doDelete()}
        >
          {!remove.isPending && <Trash2 size={15} aria-hidden />}
          {preview && preview.total > 0 ? `Delete ${preview.total} ${preview.total === 1 ? 'run' : 'runs'}` : 'Delete'}
        </Button>
        {!preview && <p className="t-meta text-text-muted">Run the check first, so you see exactly what goes.</p>}
      </Step>
    </div>
  );
};

import { useMemo } from 'react';
import { Building2, Check, Copy, PauseCircle, Trash2, UserRound, Users } from 'lucide-react';
import { Link } from 'react-router';
import { Button, IconChip, NoticeBanner, Skeleton } from '../../../../components';
import { StatCard as DashboardStatCard } from '../../../dashboard';
import { cn } from '@/lib/utils';
import { useAssignableUsersQuery, useDepartmentsQuery } from '../../hook';
import { UserBulkPicker } from '../../UserBulkPicker';
import { SelectedPeopleChips } from '../form/SelectedPeopleChips';
import { RESPONSE_MODE_ICON, RESPONSE_MODE_LABEL } from '../form/formConstants';
import { HiddenPeopleNotice } from './HiddenPeopleNotice';
import { onRadioKeyDown } from './radioGroupKeys';
import { peopleCount, splitByVisible, type StorePeople } from './useStorePeople';
import type { ChecklistResponseMode } from '../../../../api/checklistDefinitions';

interface BuilderAssignPanelProps {
  storeIds: string[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  responseMode: ChecklistResponseMode;
  onResponseModeChange: (mode: ChecklistResponseMode) => void;
  people: StorePeople;
}

const MODES: { value: ChecklistResponseMode; hint: string; example: string }[] = [
  { value: 'SHARED', hint: 'One copy per store. When one person finishes it, it is done for everyone.', example: 'Best for a shared job like opening the store.' },
  { value: 'PER_DEPARTMENT', hint: 'Each department among the people chosen fills its own copy.', example: 'Best when every team has its own round.' },
  { value: 'PER_USER', hint: 'Every person chosen fills and submits their own copy.', example: 'Best for personal checks like uniform or cash.' },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const BuilderAssignPanel = ({ storeIds, assigneeIds, onAssigneeIdsChange, responseMode, onResponseModeChange, people }: BuilderAssignPanelProps) => {
  const storeUsers = useAssignableUsersQuery(undefined, undefined, storeIds);
  const { data: departments = [] } = useDepartmentsQuery();
  const { shown, hidden } = splitByVisible(assigneeIds, people.storePersonIds);
  const { hidden: gone } = splitByVisible(hidden, people.activePersonIds);
  const otherStore = hidden.length - gone.length;
  const hiddenMessage = [
    gone.length > 0 && `${peopleCount(gone.length)} left or ${gone.length === 1 ? 'was' : 'were'} deactivated`,
    otherStore > 0 && `${peopleCount(otherStore)} ${otherStore === 1 ? 'is' : 'are'} not in the selected stores`,
  ].filter(Boolean).join(', ') + '. Saving drops them.';

  const byDepartment = useMemo(() => {
    const picked = new Set(shown);
    const names = new Map(departments.map((d) => [d.id, d.name]));
    const groups = new Map<string, number>();
    for (const u of storeUsers.data ?? []) {
      if (!picked.has(u.id)) continue;
      const name = u.departmentId ? names.get(u.departmentId) ?? 'Other' : 'No department';
      groups.set(name, (groups.get(name) ?? 0) + 1);
    }
    return [...groups.entries()];
  }, [shown, storeUsers.data, departments]);

  const peopleTotal = shown.length;
  const departmentTotal = byDepartment.length;
  const copies = peopleTotal === 0 ? 0 : responseMode === 'PER_USER' ? peopleTotal : responseMode === 'PER_DEPARTMENT' ? departmentTotal : Math.max(1, storeIds.length);

  const copiesText = (() => {
    if (peopleTotal === 0) return 'Pick people to see how many copies this makes.';
    if (responseMode === 'SHARED') return `${plural(copies, 'copy', 'copies')} each time it comes round, one per store. ${plural(peopleTotal, 'person', 'people')} can fill it, and the first to finish completes it for everyone.`;
    if (responseMode === 'PER_USER') return `${plural(copies, 'copy', 'copies')} each time it comes round. Every person fills, submits and is reviewed on their own.`;
    return `${plural(copies, 'copy', 'copies')} each time it comes round, one per department. People in a department share theirs.`;
  })();

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3" aria-label="Assignment summary">
        <DashboardStatCard modern compact label="People" value={peopleTotal} icon={Users} iconTint="text-primary-600" caption={peopleTotal === 0 ? 'Nobody yet' : 'will fill it in'} />
        <DashboardStatCard modern compact label="Departments" value={departmentTotal} icon={Building2} iconTint="text-primary-600" caption={departmentTotal === 1 ? 'department' : 'departments'} />
        <DashboardStatCard modern compact label="Copies" value={copies} icon={Copy} iconTint={copies === 0 ? 'text-text-muted' : 'text-success'} caption="per run" />
      </div>

      {peopleTotal === 0 && (
        <NoticeBanner tone="warning" icon={PauseCircle}>
          Nobody picked yet. That is fine if their account is not ready: it is saved as a draft and goes live when you add them.
        </NoticeBanner>
      )}
      {hidden.length > 0 && <HiddenPeopleNotice message={hiddenMessage} onRemove={() => onAssigneeIdsChange(shown)} />}

      <section aria-labelledby="assign-people-heading" className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-3.5 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="assign-people-heading" className="flex items-center gap-2.5 t-card font-display font-bold text-text">
            <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
              <Users size={15} strokeWidth={2.25} />
            </span>
            Who fills it in
          </h3>
          <span className="flex items-center gap-2">
            {peopleTotal > 0 && <IconChip icon={Check} tone="bg-primary-600" label={`${peopleTotal} assigned`} labelClassName="tabular-nums" />}
            {peopleTotal > 0 && (
              <Button variant="ghost" size="sm" onClick={() => onAssigneeIdsChange(hidden)} className="text-danger hover:bg-danger/10 hover:text-danger">
                <Trash2 size={13} aria-hidden />
                Clear
              </Button>
            )}
          </span>
        </div>

        {storeUsers.isPending && peopleTotal > 0 ? (
          <div className="flex flex-wrap gap-1.5" aria-busy="true">
            {['w-28', 'w-32', 'w-24'].map((w, i) => <Skeleton key={i} className={cn('h-8 rounded-full', w)} />)}
          </div>
        ) : (
          <SelectedPeopleChips ids={shown} label="Assigned people" groupByDepartment onRemove={(id) => onAssigneeIdsChange(assigneeIds.filter((a) => a !== id))} />
        )}

        <UserBulkPicker
          storeIds={storeIds}
          selected={shown}
          onChange={(ids) => onAssigneeIdsChange([...hidden, ...ids])}
          emptyHint={
            <div className="flex flex-col gap-1.5 px-2 py-2 t-meta font-display text-text-muted">
              <span className="font-semibold text-text">Nobody works at {storeIds.length === 1 ? 'this store' : 'these stores'} yet.</span>
              <span>
                Set each person's store in{' '}
                <Link to="/admin/directory" className="font-semibold text-primary-700 underline underline-offset-2 hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200">People & Teams</Link>
                , or go back and pick a different store.
              </span>
            </div>
          }
        />
      </section>

      <fieldset className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-surface p-3.5 sm:p-4">
        <legend className="sr-only">How many copies</legend>
        <h3 className="flex items-center gap-2.5 t-card font-display font-bold text-text">
          <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
            <Copy size={15} strokeWidth={2.25} />
          </span>
          How many copies
        </h3>
        <div role="radiogroup" aria-label="How many copies" className="grid gap-2.5 sm:grid-cols-3">
          {MODES.map((m, index) => {
            const on = responseMode === m.value;
            const Icon = RESPONSE_MODE_ICON[m.value];
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => onResponseModeChange(m.value)}
                onKeyDown={(e) => onRadioKeyDown(e, index, MODES.length, (next) => onResponseModeChange(MODES[next].value))}
                className={cn(
                  'relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                  on ? 'border-primary-500/60 bg-primary-500/10' : 'border-border/60 bg-surface hover:border-border-hover',
                )}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className={cn('flex size-9 items-center justify-center rounded-lg', on ? 'bg-primary-600 text-white' : 'bg-surface-hover text-text-secondary')} aria-hidden="true">
                    <Icon size={17} strokeWidth={2.25} />
                  </span>
                  <span className={cn('flex size-5 items-center justify-center rounded-full border-2 transition-colors', on ? 'border-primary-600 bg-primary-600 text-white' : 'border-border-hover')} aria-hidden="true">
                    {on && <Check size={11} strokeWidth={3.5} />}
                  </span>
                </span>
                <span className={cn('text-sm font-display font-bold', on ? 'text-primary-700 dark:text-primary-300' : 'text-text')}>{RESPONSE_MODE_LABEL[m.value]}</span>
                <span className="t-meta font-display leading-relaxed text-text-muted">{m.hint}</span>
                <span className="t-meta font-display font-medium leading-relaxed text-text-secondary">{m.example}</span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 rounded-xl bg-surface-hover/60 p-3">
          <span className="flex items-center gap-2 t-meta font-display font-semibold text-text-secondary">
            <IconChip icon={RESPONSE_MODE_ICON[responseMode]} tone="bg-primary-600" label={RESPONSE_MODE_LABEL[responseMode]} />
            <span className="tabular-nums">{copies > 0 ? plural(copies, 'copy', 'copies') : 'No copies yet'}</span>
          </span>
          <p className="t-meta font-display leading-relaxed text-text-secondary" aria-live="polite">{copiesText}</p>
          {byDepartment.length > 0 && responseMode === 'PER_DEPARTMENT' && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Departments that get a copy">
              {byDepartment.map(([name, count]) => (
                <li key={name}><IconChip icon={UserRound} tone="bg-primary-600" label={`${name} · ${count}`} labelClassName="tabular-nums" /></li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>
    </div>
  );
};

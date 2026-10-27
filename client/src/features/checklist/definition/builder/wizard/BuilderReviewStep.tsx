import { useMemo, type ReactNode } from 'react';
import {
  AlertTriangle, Camera, Check, CalendarDays, CheckCircle2, Copy, Flag, Info, Layers, ListChecks, type LucideIcon,
  Pencil, PauseCircle, Repeat, ShieldCheck, Store, Type, Users, Zap, CalendarClock,
} from 'lucide-react';
import { Button, IconChip, InlineError, NoticeBanner, Skeleton, formatWeekdays } from '../../../../../components';
import { cn } from '@/lib/utils';
import { useStoresQuery, useAssignableUsersQuery } from '../../../hook';
import { RECURRENCE_LABEL, formatDate } from '../../../checklistDisplay';
import { SelectedPeopleChips } from '../../form/SelectedPeopleChips';
import { RESPONSE_MODE_ICON, RESPONSE_MODE_LABEL } from '../../form/formConstants';
import { questionTypeOf } from '../questionTypes';
import { WindowTimeline } from '../WindowTimeline';
import { isOvernightWindow } from '../scheduleWindow';
import type { ItemDraft } from '../../ChecklistDefinitionItemDraftRow';
import type { ChecklistRecurrence, ChecklistResponseMode } from '../../../../../api/checklistDefinitions';

interface BuilderReviewStepProps {
  name: string;
  description: string;
  storeIds: string[];
  recurrence: ChecklistRecurrence;
  startDate: string;
  opensTime: string;
  cutoffTime: string;
  lateUntilTime: string;
  activeWeekdays: number[];
  responseMode: ChecklistResponseMode;
  itemDrafts: ItemDraft[];
  assigneeIds: string[];
  reviewerIds: string[];
  sectionValidity: readonly [boolean, boolean, boolean, boolean, boolean];
  hasPeople: boolean;
  hideSubmit?: boolean;
  onEditSection: (stepIndex: number) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  isEditing: boolean;
  isActive?: boolean;
  onSubmit: () => void;
  submitError?: string;
  onReloadLatest?: () => void;
}

const SECTIONS: { label: string; icon: LucideIcon }[] = [
  { label: 'Basics', icon: Type },
  { label: 'Schedule', icon: CalendarClock },
  { label: 'Questions', icon: ListChecks },
  { label: 'Reviewers', icon: ShieldCheck },
  { label: 'Assign', icon: Users },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const formatStart = (value: string) => {
  if (!value) return 'No date set';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : formatDate(d.toISOString());
};

const clock = (value: string) => {
  const [h, m] = value.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}` : value;
};

const ReviewCard = ({ label, icon: Icon, valid, onEdit, aside, children }: {
  label: string;
  icon: LucideIcon;
  valid: boolean;
  onEdit: () => void;
  aside?: ReactNode;
  children: ReactNode;
}) => (
  <section aria-label={label} className={cn('flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-surface', valid ? 'border-border/60' : 'border-warning/50')}>
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-b px-3.5 py-3 sm:px-4',
        valid ? 'border-border/60 bg-linear-to-r from-primary-500/[0.08] via-primary-500/[0.03] to-transparent' : 'border-warning/30 bg-warning/8',
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl text-white', valid ? 'bg-linear-to-br from-primary-500 to-primary-700' : 'bg-warning')}
          aria-hidden="true"
        >
          <Icon size={18} strokeWidth={2.25} />
        </span>
        <h3 className="t-card font-display font-bold text-text">{label}</h3>
        {aside}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {!valid && <IconChip icon={AlertTriangle} tone="bg-warning" label="Needs attention" labelClassName="text-warning" />}
        <Button
          variant="outline"
          size="sm"
          onClick={onEdit}
          aria-label={`Edit ${label}`}
          className="gap-1.5 border-primary-500/30 text-primary-700 hover:border-primary-500/50 hover:bg-primary-500/10 dark:text-primary-300 pointer-coarse:h-11"
        >
          <Pencil size={12} aria-hidden />
          Edit
        </Button>
      </span>
    </header>
    <div className="flex flex-col gap-3 p-3.5 sm:p-4">{children}</div>
  </section>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="t-meta font-display font-semibold text-text-muted">{label}</span>
    {children}
  </div>
);

export const BuilderReviewStep = ({
  name, description, storeIds, recurrence, startDate, opensTime, cutoffTime, lateUntilTime, activeWeekdays, responseMode,
  itemDrafts, assigneeIds, reviewerIds, sectionValidity, hasPeople, hideSubmit = false, onEditSection, canSubmit, isSubmitting,
  isEditing, isActive, onSubmit, submitError, onReloadLatest,
}: BuilderReviewStepProps) => {
  const storesQuery = useStoresQuery();
  const storeUsers = useAssignableUsersQuery(undefined, undefined, storeIds);
  const everyone = useAssignableUsersQuery();

  const storeNames = useMemo(
    () => storeIds.map((id) => storesQuery.data?.find((s) => s.id === id)?.name ?? 'Store'),
    [storesQuery.data, storeIds],
  );
  const named = useMemo(() => itemDrafts.filter((d) => d.label.trim()), [itemDrafts]);
  const stats = useMemo(() => ({
    proof: named.filter((d) => Number(d.requiredImageCount) > 0).length,
    live: named.filter((d) => Number(d.requiredImageCount) > 0 && d.requiresLivePhoto).length,
    rules: named.reduce((n, d) => n + d.yesActions.length + d.noActions.length, 0),
    critical: named.filter((d) => d.isCritical).length,
    sections: new Set(named.map((d) => d.section).filter(Boolean)).size,
  }), [named]);

  const activeIds = useMemo(() => new Set((everyone.data ?? []).map((u) => u.id)), [everyone.data]);
  const storeIdsSet = useMemo(() => new Set((storeUsers.data ?? []).map((u) => u.id)), [storeUsers.data]);
  const activeReviewers = everyone.data ? reviewerIds.filter((id) => activeIds.has(id)) : reviewerIds;
  const droppedReviewers = everyone.data ? reviewerIds.length - activeReviewers.length : 0;
  const keptAssignees = storeUsers.data ? assigneeIds.filter((id) => storeIdsSet.has(id)) : assigneeIds;
  const droppedAssignees = storeUsers.data ? assigneeIds.length - keptAssignees.length : 0;

  const problems = sectionValidity.map((valid, index) => (valid ? null : index)).filter((i): i is number => i !== null);
  const ready = problems.length === 0;
  const outcome = !ready
    ? { tone: 'warning' as const, icon: AlertTriangle, title: `${plural(problems.length, 'step needs', 'steps need')} attention`, text: 'Fix the highlighted steps, then save.' }
    : hasPeople
      ? { tone: 'success' as const, icon: CheckCircle2, title: isEditing ? 'Ready to save' : 'Ready to go live', text: isEditing ? 'Your changes are checked and ready.' : 'Everything is filled in. Creating it starts today’s runs for the people you picked.' }
      : { tone: 'neutral' as const, icon: PauseCircle, title: 'Ready to save as a draft', text: 'Nobody is assigned, so nothing runs yet. Add people later and it goes live by itself.' };

  const copies = keptAssignees.length === 0 ? 0 : responseMode === 'PER_USER' ? keptAssignees.length : responseMode === 'SHARED' ? Math.max(1, storeIds.length) : null;
  const overnight = isOvernightWindow(opensTime, cutoffTime);

  const effects: { icon: LucideIcon; text: string }[] = [];
  if (isEditing && isActive !== undefined) {
    if (isActive && !hasPeople) effects.push({ icon: PauseCircle, text: 'Nobody is assigned, so saving turns this into a draft. Today’s runs nobody started are removed. Started runs stay.' });
    else if (isActive) effects.push({ icon: Info, text: 'Today’s runs nobody started are rebuilt. Started runs keep every answer and get your changes. Runs sent for review or approved stay as they are.' });
    else if (hasPeople) effects.push({ icon: Check, text: 'This checklist is off and you picked people. Saving puts it live and creates today’s run for them.' });
    else effects.push({ icon: PauseCircle, text: 'This checklist stays a draft until you assign people.' });
  }
  if (hasPeople && copies !== null) effects.push({ icon: Copy, text: `${plural(copies, 'copy', 'copies')} each time it comes round (${RESPONSE_MODE_LABEL[responseMode].toLowerCase()}).` });
  if (hasPeople && copies === null) effects.push({ icon: Copy, text: `One copy per department among the ${plural(keptAssignees.length, 'person', 'people')} picked.` });
  if (lateUntilTime) effects.push({ icon: CalendarClock, text: `Staff who miss the closing time can still fill it until ${clock(lateUntilTime)}. It counts as filled late.` });

  const Outcome = outcome.icon;

  return (
    <div className="flex w-full flex-col gap-5">
      <section
        aria-label="Readiness"
        className={cn(
          'flex flex-col gap-4 rounded-2xl border p-4 sm:p-5',
          outcome.tone === 'warning' && 'border-warning/50 bg-warning/5',
          outcome.tone === 'success' && 'border-success/40 bg-success/5',
          outcome.tone === 'neutral' && 'border-border/60 bg-surface',
        )}
      >
        <div className="flex items-start gap-3.5">
          <span
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl text-white',
              outcome.tone === 'warning' ? 'bg-warning' : outcome.tone === 'success' ? 'bg-success' : 'bg-linear-to-br from-primary-500 to-primary-700',
            )}
            aria-hidden="true"
          >
            <Outcome size={20} strokeWidth={2.25} />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="t-section font-display font-bold text-text">{outcome.title}</h3>
            <p className="t-meta font-display text-text-secondary">{outcome.text}</p>
          </div>
        </div>

        <ol aria-label="Steps" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {SECTIONS.map((section, index) => {
            const valid = sectionValidity[index];
            const Icon = section.icon;
            return (
              <li key={section.label}>
                <button
                  type="button"
                  onClick={() => onEditSection(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 text-left min-h-11 cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                    valid ? 'border-border/60 bg-surface hover:border-border-hover' : 'border-warning/50 bg-warning/10 hover:border-warning',
                  )}
                >
                  <span className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-white', valid ? 'bg-success' : 'bg-warning')} aria-hidden="true">
                    {valid ? <Check size={13} strokeWidth={3.5} /> : <AlertTriangle size={12} strokeWidth={3} />}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="t-meta font-display font-bold text-text">{section.label}</span>
                    <span className={cn('flex items-center gap-1 text-[11px] font-display font-medium leading-4', valid ? 'text-text-muted' : 'text-warning')}>
                      <Icon size={10} aria-hidden="true" />
                      {valid ? 'Done' : 'Fix this'}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        <ul aria-label="At a glance" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: 'Questions', value: named.length, icon: ListChecks },
            { label: 'Stores', value: storeIds.length, icon: Store },
            { label: 'People', value: keptAssignees.length, icon: Users },
            { label: 'Reviewers', value: activeReviewers.length, icon: ShieldCheck },
          ].map((tile) => (
            <li key={tile.label} className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-700 dark:bg-primary-500/15 dark:text-primary-300" aria-hidden="true">
                <tile.icon size={17} strokeWidth={2.25} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="t-stat font-display font-extrabold leading-none tabular-nums text-text">{tile.value}</span>
                <span className="t-meta font-display font-medium text-text-muted">{tile.label}</span>
              </span>
            </li>
          ))}
        </ul>

        {effects.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <span className="t-meta font-display font-semibold text-text-secondary">What happens when you save</span>
            <ul className="flex flex-col gap-1.5">
              {effects.map((effect) => (
                <li key={effect.text} className="flex items-start gap-2 t-meta font-display leading-relaxed text-text-secondary">
                  <effect.icon size={14} className="mt-0.5 shrink-0 text-text-light" aria-hidden="true" />
                  <span>{effect.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ReviewCard label="Basics" icon={Type} valid={sectionValidity[0]} onEdit={() => onEditSection(0)}>
          <Field label="Name">
            <p className="text-sm font-display font-bold text-text break-words">{name.trim() || <span className="font-medium italic text-text-muted">Untitled checklist</span>}</p>
          </Field>
          <Field label="Description">
            <p className="t-meta font-display leading-relaxed text-text-secondary line-clamp-4">
              {description.trim() || <span className="italic text-text-muted">No description provided.</span>}
            </p>
          </Field>
        </ReviewCard>

        <ReviewCard label="Schedule" icon={CalendarClock} valid={sectionValidity[1]} onEdit={() => onEditSection(1)}>
          <Field label="Stores">
            {storeIds.length === 0 ? (
              <span className="t-meta font-display font-medium text-warning">No stores selected</span>
            ) : storesQuery.isPending ? (
              <Skeleton className="h-7 w-40 rounded-full" />
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {storeNames.map((storeName, i) => <li key={`${storeName}-${i}`}><IconChip icon={Store} tone="bg-primary-600" label={storeName} /></li>)}
              </ul>
            )}
          </Field>
          <ul className="flex flex-wrap gap-1.5" aria-label="When it runs">
            <li><IconChip icon={Repeat} tone="bg-primary-600" label={`${RECURRENCE_LABEL[recurrence] ?? recurrence}${recurrence === 'DAILY' ? ` · ${formatWeekdays(activeWeekdays)}` : ''}`} /></li>
            <li><IconChip icon={CalendarDays} tone="bg-primary-600" label={`${recurrence === 'ONE_TIME' ? 'Due' : 'Starts'} ${formatStart(startDate)}`} /></li>
            {overnight && <li><IconChip icon={Info} tone="bg-text-muted" label="Closes next morning" /></li>}
          </ul>
          <WindowTimeline opensTime={opensTime} cutoffTime={cutoffTime} lateUntilTime={lateUntilTime} />
        </ReviewCard>

        <ReviewCard
          label="Questions"
          icon={ListChecks}
          valid={sectionValidity[2]}
          onEdit={() => onEditSection(2)}
          aside={<IconChip icon={false} label={plural(named.length, 'question', 'questions')} labelClassName="tabular-nums" />}
        >
          {named.length === 0 ? (
            <p className="py-3 text-center t-meta font-display italic text-text-muted">You haven’t added any questions yet.</p>
          ) : (
            <>
              <ul className="flex flex-wrap gap-1.5" aria-label="Question summary">
                {stats.proof > 0 && <li><IconChip icon={Camera} tone={stats.live > 0 ? 'bg-success' : 'bg-primary-600'} label={`${plural(stats.proof, 'photo question', 'photo questions')}${stats.live > 0 ? `, ${stats.live} live` : ''}`} /></li>}
                {stats.rules > 0 && <li><IconChip icon={Zap} tone="bg-warning" label={plural(stats.rules, 'rule', 'rules')} /></li>}
                {stats.critical > 0 && <li><IconChip icon={Flag} tone="bg-danger" label={`${stats.critical} critical`} /></li>}
                {stats.sections > 0 && <li><IconChip icon={Layers} tone="bg-text-muted" label={plural(stats.sections, 'section', 'sections')} /></li>}
              </ul>
              <ol className="flex max-h-64 flex-col divide-y divide-border/40 overflow-y-auto pr-1">
                {named.map((item, index) => {
                  const type = questionTypeOf(item);
                  const TypeIcon = type.icon;
                  return (
                    <li key={item.key} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
                      <span className="w-6 shrink-0 t-meta font-display font-semibold tabular-nums text-text-light">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-display font-medium text-text" title={item.label}>{item.label}</span>
                      {item.section && <IconChip icon={Layers} tone="bg-text-muted" label={item.section} className="hidden max-w-32 sm:inline-flex" />}
                      {item.isCritical && <Flag size={13} className="shrink-0 text-danger" aria-label="Critical" />}
                      <IconChip icon={TypeIcon} tone="bg-primary-600" label={type.label} className="shrink-0" />
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </ReviewCard>

        <div className="flex min-w-0 flex-col gap-4">
          <ReviewCard label="Reviewers" icon={ShieldCheck} valid={sectionValidity[3] ?? true} onEdit={() => onEditSection(3)}>
            {reviewerIds.length === 0 ? (
              <p className="t-meta font-display leading-relaxed text-text-muted">No one extra picked. PC and Admin, and each assignee’s department head, can still review.</p>
            ) : everyone.isPending ? (
              <Skeleton className="h-8 w-48 rounded-full" />
            ) : everyone.isError ? (
              <InlineError message="We couldn't load the people." onRetry={() => everyone.refetch()} />
            ) : (
              <SelectedPeopleChips ids={activeReviewers} label="Reviewers" />
            )}
            {droppedReviewers > 0 && (
              <p className="flex items-center gap-1.5 t-meta font-display font-medium text-warning">
                <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
                {plural(droppedReviewers, 'person is', 'people are')} no longer active and will be left out.
              </p>
            )}
          </ReviewCard>

          <ReviewCard
            label="Assign"
            icon={Users}
            valid={sectionValidity[4] ?? true}
            onEdit={() => onEditSection(4)}
            aside={<IconChip icon={RESPONSE_MODE_ICON[responseMode]} tone="bg-primary-600" label={RESPONSE_MODE_LABEL[responseMode]} />}
          >
            {storeUsers.isPending && assigneeIds.length > 0 ? (
              <Skeleton className="h-8 w-48 rounded-full" />
            ) : storeUsers.isError ? (
              <InlineError message="We couldn't load the people." onRetry={() => storeUsers.refetch()} />
            ) : keptAssignees.length === 0 ? (
              <p className="t-meta font-display font-medium leading-relaxed text-warning">Nobody yet. It is saved as a draft and goes live when you add people.</p>
            ) : (
              <SelectedPeopleChips ids={keptAssignees} label="Assigned people" groupByDepartment />
            )}
            {droppedAssignees > 0 && (
              <p className="flex items-center gap-1.5 t-meta font-display font-medium text-warning">
                <AlertTriangle size={13} className="shrink-0" aria-hidden="true" />
                {plural(droppedAssignees, 'person is', 'people are')} not in the selected stores and will be left out.
              </p>
            )}
          </ReviewCard>
        </div>
      </div>

      {submitError && <InlineError message={submitError} />}
      {submitError && onReloadLatest && (
        <Button variant="outline" size="sm" className="self-start" onClick={onReloadLatest}>
          Load the latest version
        </Button>
      )}

      {!hideSubmit && (
        <div className="flex flex-col gap-3 border-t border-border/60 pt-4 sm:flex-row sm:items-center sm:justify-end">
          {!canSubmit && (
            <NoticeBanner tone="warning" icon={AlertTriangle} className="sm:flex-1">Fix the steps marked above, then save.</NoticeBanner>
          )}
          <Button variant="primary" onClick={onSubmit} isLoading={isSubmitting} disabled={!canSubmit} className="w-full sm:w-auto pointer-coarse:h-11">
            {isSubmitting ? 'Saving…' : isEditing ? 'Save changes' : hasPeople ? 'Create checklist' : 'Save as draft'}
          </Button>
        </div>
      )}
    </div>
  );
};

import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardCheck } from 'lucide-react';
import { EmptyState, ExportMenu, InlineError, Skeleton, PANEL_CLASS } from '../../components';
import { CATEGORY_PREDICATES } from '../tasks/taskFilters';
import { rateToneClass } from '../checklist/checklistDisplay';
import { CategoryBarChart, type CategoryBar } from './CategoryBarChart';
import { exportTitle, type TableRows } from '../../lib/exportTable';
import { cn } from '../../lib/utils';
import type { ChecklistReportMetrics } from '../../api/checklistReports';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import { useTeamTaskChecklistTotals } from './useTeamChecklistReport';
import { TEAM_PERIOD_LABELS, TEAM_PERIOD_PHRASE, selectPersonWork, type ReportState, type TeamPeriod, type TeamPeriodRange } from './teamDisplay';

interface PersonChecklistViewProps {
  personName: string;
  /** Only used for the export sheet's "Department" row. */
  departmentName: string;
  departmentId: string;
  personId: string;
  tasks: Task[];
  tickets: Ticket[];
  /** The page-level period: it drives the checklist report, the delegation/ticket counts and the
   *  wording below, so every number on this screen is for the same window. */
  period: TeamPeriod;
  range: TeamPeriodRange;
  /** This person's row from the checklist report; undefined means no checklist ran for them. */
  checklist: ChecklistReportMetrics | undefined;
  reportState: ReportState;
  /** True while the previous period's numbers are still on screen. */
  isRefreshing: boolean;
  onRetryReport: () => void;
}

const STAT_TILE_CLASS = 'flex flex-col gap-1 rounded-xl border border-border/60 bg-surface p-4 min-w-0';

interface BigStatProps {
  label: string;
  /** null renders as a muted "-"; `detail` then says why there is no number. */
  value: string | null;
  valueClassName?: string;
  /** The raw counts behind the number, e.g. "7 of 7 completed". */
  detail: string;
  /** Optional one-line plain explanation. */
  hint?: string;
}

const BigStat = ({ label, value, valueClassName, detail, hint }: BigStatProps) => (
  <div className={STAT_TILE_CLASS}>
    <span className="t-meta font-display font-semibold text-text-muted">{label}</span>
    <span className={cn('t-figure font-display font-bold tabular-nums', value === null ? 'text-text-light' : valueClassName ?? 'text-text')}>
      {value ?? '-'}
    </span>
    <span className="t-meta font-display font-medium text-text-secondary">{detail}</span>
    {hint && <span className="t-meta font-display text-text-muted">{hint}</span>}
  </div>
);

const pctText = (pct: number | null) => (pct === null ? null : `${pct}%`);

// One person, one period, two kinds of work. Store checklists (the recurring runs people fill in
// from My Checklists) come first: they come from the checklist report and are what most of the
// team does every day. Below them, the older delegation/issue/ticket breakdown, whose bars each
// jump straight to that person's filtered list. Photo proof and the Todo bar come from the
// task-checklist aggregation (task.service.ts's complianceReport), scoped to this person.
export const PersonChecklistView = ({
  personName,
  departmentName,
  departmentId,
  personId,
  tasks,
  tickets,
  period,
  range,
  checklist,
  reportState,
  isRefreshing,
  onRetryReport,
}: PersonChecklistViewProps) => {
  const navigate = useNavigate();
  const phrase = TEAM_PERIOD_PHRASE[period];
  const taskTotals = useTeamTaskChecklistTotals(range, departmentId, personId);

  // The same selector the person card uses, so the card and this screen always agree.
  const { tasks: periodTasks, tickets: periodTickets } = useMemo(
    () => selectPersonWork(tasks, tickets, personId, departmentId, range),
    [tasks, tickets, personId, departmentId, range],
  );

  const goToTasks = (category: 'task' | 'issue' | 'delegation') =>
    navigate(`/tasks?assigneeIds=${personId}&category=${category}`);
  const goToTickets = () => navigate(`/tickets?assigneeIds=${personId}`);

  const countDoneTotal = (list: Task[]) => ({ done: list.filter((t) => t.status === 'done').length, total: list.length });
  const taskStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.task));
  const issueStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.issue));
  const delegationStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.delegation));
  const ticketStats = { done: periodTickets.filter((t) => t.status === 'CLOSED').length, total: periodTickets.length };

  // Every task (any category) + every ticket, done vs. total. Store checklist runs are NOT in
  // here: they have their own section above, so the two never get blended into one number.
  const workDone = taskStats.done + issueStats.done + delegationStats.done + ticketStats.done;
  const workTotal = taskStats.total + issueStats.total + delegationStats.total + ticketStats.total;
  const workRate = workTotal > 0 ? Math.round((workDone / workTotal) * 100) : null;

  const photo = taskTotals.data;
  const todoStats = { done: photo?.doneItems ?? 0, total: photo?.totalItems ?? 0 };

  // Numbers as numbers (85, not "85%"), so the sheet can sum and sort; empty where there is no figure.
  const buildExportRows = (): TableRows => [
    ['Store checklists', 'Value'],
    ['Checklists assigned', checklist?.assigned ?? 0],
    ['Completed', checklist?.completed ?? 0],
    ['Completion %', checklist?.completionPct ?? null],
    ['Completed on time', checklist?.onTime ?? 0],
    ['On time %', checklist?.onTimePct ?? null],
    ['Missed', checklist?.missed ?? 0],
    ['Sent back', checklist?.sentBack ?? 0],
    ['Answers checked', checklist?.answersChecked ?? 0],
    ['Compliance %', checklist && checklist.answersChecked > 0 ? checklist.compliancePct : null],
    [],
    ['Delegations, issues and tickets', 'Value'],
    ['Completion rate %', workRate],
    ['Photo proof %', photo?.photoRate ?? null],
    [],
    ['Category', 'Done', 'Total'],
    ['Direct Task', taskStats.done, taskStats.total],
    ['Issue', issueStats.done, issueStats.total],
    ['Delegation', delegationStats.done, delegationStats.total],
    ['Ticket', ticketStats.done, ticketStats.total],
    ['Todo Task (checklist items)', todoStats.done, todoStats.total],
  ];

  // No per-category colour: the chart colours each bar by its own rate, so red means a low rate,
  // not "this is the Issue bar".
  const bars: CategoryBar[] = [
    { key: 'task', label: 'Direct Task', onClick: () => goToTasks('task'), ...taskStats },
    { key: 'issue', label: 'Issue', onClick: () => goToTasks('issue'), ...issueStats },
    { key: 'delegation', label: 'Delegation', onClick: () => goToTasks('delegation'), ...delegationStats },
    { key: 'ticket', label: 'Ticket', onClick: goToTickets, ...ticketStats },
    { key: 'todo', label: 'Todo Task', onClick: () => navigate(`/tasks?assigneeIds=${personId}`), ...todoStats },
  ];

  const m = checklist;

  return (
    // No dim while the next period loads (the old numbers stay put); the page header says "Updating…".
    <div className={cn(PANEL_CLASS, 'p-4 sm:p-6 flex flex-col gap-6')} aria-busy={isRefreshing}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h2 className="t-section font-display font-bold text-text tracking-tight">{personName}</h2>
          <p className="t-meta font-display font-medium text-text-muted">Store checklists, delegations, issues and tickets, {phrase}</p>
        </div>

        {/* Downloads exactly what's on screen, generated in the browser (see lib/exportTable), so
            the file can never disagree with what this person is looking at. */}
        <ExportMenu
          aria-label="Export this person's numbers"
          disabled={reportState === 'loading'}
          filename={`${personName.toLowerCase().replace(/\s+/g, '-')}-team-overview`}
          sheetName="Team Overview"
          title={exportTitle({ what: `Team overview, ${personName}`, from: range.from, to: range.to, period: TEAM_PERIOD_LABELS[period], filters: { Department: departmentName } })}
          // Three small tables: 9 checklist figures, 2 work figures, 5 categories.
          getRows={() => ({ rows: buildExportRows(), count: 9 + 2 + 5 })}
        />
      </div>

      <section aria-labelledby="team-store-checklists" className="flex flex-col gap-3">
        <h3 id="team-store-checklists" className="t-section font-display font-bold text-text">Store checklists</h3>

        {reportState === 'loading' ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : reportState === 'error' ? (
          <InlineError message="Could not load this person's store checklist numbers." onRetry={onRetryReport} />
        ) : !m || m.assigned === 0 ? (
          <EmptyState icon={ClipboardCheck} size="compact" title="No store checklists were assigned in this period" />
        ) : (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <BigStat
                label="Completion"
                value={pctText(m.completionPct)}
                valueClassName={m.completionPct === null ? undefined : rateToneClass(m.completionPct)}
                detail={`${m.completed} of ${m.assigned} completed`}
              />
              <BigStat
                label="On time"
                value={pctText(m.onTimePct)}
                valueClassName={m.onTimePct === null ? undefined : rateToneClass(m.onTimePct)}
                detail={m.completed > 0 ? `${m.onTime} of ${m.completed} finished on time` : 'Nothing finished yet'}
              />
              <BigStat
                label="Compliance"
                value={m.answersChecked > 0 ? pctText(m.compliancePct) : null}
                valueClassName={m.compliancePct === null ? undefined : rateToneClass(m.compliancePct)}
                detail={m.answersChecked > 0 ? `${m.answersChecked} answers checked` : 'No scored answers in this period'}
                hint="Checked answers that were right"
              />
              <BigStat
                label="Sent back"
                value={String(m.sentBack)}
                valueClassName={m.sentBack > 0 ? 'text-warning' : undefined}
                detail={`of ${m.assigned} ${m.assigned === 1 ? 'checklist' : 'checklists'}`}
              />
            </div>
            {m.missed > 0 && (
              <p className="t-meta font-display font-medium text-danger">
                {m.missed} {m.missed === 1 ? 'checklist was' : 'checklists were'} missed: past the cutoff and not finished.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="team-delegations" className="flex flex-col gap-3">
        <h3 id="team-delegations" className="t-section font-display font-bold text-text">Delegations, issues and tickets</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BigStat
            label="Completion rate"
            value={pctText(workRate)}
            valueClassName={workRate === null ? undefined : rateToneClass(workRate)}
            detail={workRate === null ? `None were created ${phrase}` : `${workDone} of ${workTotal} marked done`}
          />
          <div className={STAT_TILE_CLASS}>
            <span className="t-meta font-display font-semibold text-text-muted">Photo proof</span>
            {taskTotals.isPending ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <span className={cn('t-figure font-display font-bold tabular-nums', photo?.photoRate == null ? 'text-text-light' : rateToneClass(photo.photoRate))}>
                {photo?.photoRate == null ? '-' : `${photo.photoRate}%`}
              </span>
            )}
            <span className="t-meta font-display font-medium text-text-secondary">
              {taskTotals.isError
                ? "Photo numbers didn't load"
                : photo?.photoRate == null
                  ? 'No photo-evidence items in this period'
                  : `${photo.photoOk} of ${photo.photoItems} required photos uploaded`}
            </span>
          </div>
        </div>

        <CategoryBarChart bars={bars} />
      </section>
    </div>
  );
};

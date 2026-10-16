import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ClipboardCheck } from 'lucide-react';
import { EmptyState, ExportMenu, InlineError, Skeleton, PANEL_CLASS } from '../../components';
import { CATEGORY_PREDICATES } from '../tasks/taskFilters';
import { rateToneClass } from '../checklist/checklistDisplay';
import { CategoryBarChart, type CategoryBar } from './CategoryBarChart';
import { exportPct, exportTitle, type TableRows } from '../../lib/exportTable';
import { formatPct, roundPct } from '../../lib/percent';
import type { ScoreReportRow } from '../../api/scores';
import { cn } from '../../lib/utils';
import type { ChecklistReportMetrics } from '../../api/checklistReports';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';
import { useTeamTaskChecklistTotals } from './useTeamChecklistReport';
import { selectPersonWork, type ReportState, type TeamPeriodRange } from './teamDisplay';

interface PersonChecklistViewProps {
  personName: string;
  /** Only used for the export sheet's "Department" row. */
  departmentName: string;
  departmentId: string;
  personId: string;
  /** Created in the period (the category bars' cohort). */
  tasks: Task[];
  tickets: Ticket[];
  workLoading: boolean;
  /** This person's scores row (the Scorecard's numbers); undefined means nothing was due. */
  scores: ScoreReportRow | undefined;
  /** The page-level period: it drives the checklist report, the delegation/ticket counts and the
   *  wording below, so every number on this screen is for the same window. */
  /** The window in words: "This month", "1 Oct 2026 to 14 Oct 2026". */
  periodLabel: string;
  /** The window after a verb or noun: "this month", "from 1 Oct 2026 to 14 Oct 2026". */
  periodPhrase: string;
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
    <span className={cn('t-stat font-display font-bold tabular-nums', value === null ? 'text-text-light' : valueClassName ?? 'text-text')}>
      {value ?? '-'}
    </span>
    <span className="t-meta font-display font-medium text-text-secondary">{detail}</span>
    {hint && <span className="t-meta font-display text-text-muted">{hint}</span>}
  </div>
);

const pctText = (pct: number | null) => (pct === null ? null : formatPct(pct));

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
  workLoading,
  scores,
  periodLabel,
  periodPhrase,
  range,
  checklist,
  reportState,
  isRefreshing,
  onRetryReport,
}: PersonChecklistViewProps) => {
  const navigate = useNavigate();
  const phrase = periodPhrase;
  const taskTotals = useTeamTaskChecklistTotals(range, departmentId, personId);

  // The same selector the person card uses, so the card and this screen always agree.
  const { tasks: periodTasks, tickets: periodTickets } = useMemo(
    () => selectPersonWork(tasks, tickets, personId, departmentId, range),
    [tasks, tickets, personId, departmentId, range],
  );

  const goToTasks = (category: 'task' | 'issue' | 'delegation') =>
    navigate(`/tasks?assigneeIds=${personId}&category=${category}`);
  const goToTickets = () => navigate(`/tickets?assigneeIds=${personId}`);

  // Drafts are not real work yet, so they are in no count (selectPersonWork already leaves them out).
  const countDoneTotal = (list: Task[]) => ({ done: list.filter((t) => t.status === 'done').length, total: list.length });
  const taskStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.task));
  const issueStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.issue));
  const delegationStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.delegation));
  const ticketStats = { done: periodTickets.filter((t) => t.status === 'CLOSED').length, total: periodTickets.length };

  // Tickets and delegations that came DUE in the period, done out of due: the scores report's own numbers, the
  // same as the Scorecard. Store checklist runs are NOT in here (they have their own section above), and the
  // bars below count what was CREATED in the period, so the two are labelled apart.
  const workDue = (scores?.ticket.due ?? 0) + (scores?.delegation.due ?? 0);
  const workDone = (scores?.ticket.closed ?? 0) + (scores?.delegation.done ?? 0);
  const workRate = workDue > 0 ? roundPct((workDone / workDue) * 100) : null;

  const photo = taskTotals.data;
  const todoStats = { done: photo?.doneItems ?? 0, total: photo?.totalItems ?? 0 };

  // Numbers as numbers (85, not "85%"), so the sheet can sum and sort; empty where there is no figure.
  const buildExportRows = (): TableRows => [
    ['Store checklists', 'Value'],
    ['Checklists due', checklistDue],
    ['Completed', checklist?.completed ?? 0],
    ['Completion % (completed of due)', exportPct(checklist?.completionPct)],
    ['Completed on time', checklist?.onTime ?? 0],
    ['Met deadline % (on time of due)', exportPct(checklist?.metDeadlinePct)],
    ['On time % (of finished)', exportPct(onTimeOfFinished)],
    ['Missed', checklist?.missed ?? 0],
    ['Still open (not counted yet)', checklist?.open ?? 0],
    ['Sent back', checklist?.sentBack ?? 0],
    ['Answers checked', checklist?.answersChecked ?? 0],
    ['Answers right % (compliance)', checklist && checklist.answersChecked > 0 ? exportPct(checklist.compliancePct) : null],
    [],
    ['Tickets and delegations due in this period', 'Value'],
    ['Due', workDue],
    ['Done', workDone],
    ['Completion % (done of due)', exportPct(workRate)],
    ['Photo proof % (required photos uploaded)', exportPct(photo?.photoRate)],
    [],
    ['Created in this period', 'Done', 'Created'],
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
  const checklistDue = m ? m.due ?? m.assigned : 0;
  const onTimeOfFinished = m ? m.onTimeOfFinishedPct ?? m.onTimePct : null;

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
          title={exportTitle({ what: `Team overview, ${personName}`, from: range.from, to: range.to, period: periodLabel, filters: { Department: departmentName } })}
          // Three small tables: 9 checklist figures, 2 work figures, 5 categories.
          getRows={() => ({ rows: buildExportRows(), count: 11 + 4 + 5 })}
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
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <BigStat
                label="Completion"
                value={pctText(m.completionPct)}
                valueClassName={m.completionPct === null ? undefined : rateToneClass(m.completionPct)}
                detail={checklistDue > 0 ? `${m.completed} of ${checklistDue} due were filled` : 'Nothing was due yet'}
              />
              <BigStat
                label="Met deadline"
                value={pctText(m.metDeadlinePct ?? null)}
                valueClassName={m.metDeadlinePct == null ? undefined : rateToneClass(m.metDeadlinePct)}
                detail={checklistDue > 0 ? `${m.onTime} of ${checklistDue} due were filled on time` : 'Nothing was due yet'}
                hint="Late and missed both count against it"
              />
              <BigStat
                label="On time (of finished)"
                value={pctText(onTimeOfFinished)}
                valueClassName={onTimeOfFinished === null ? undefined : rateToneClass(onTimeOfFinished)}
                detail={m.completed > 0 ? `${m.onTime} of ${m.completed} filled were on time` : 'Nothing filled yet'}
              />
              <BigStat
                label="Answers right"
                value={m.answersChecked > 0 ? pctText(m.compliancePct) : null}
                valueClassName={m.compliancePct === null ? undefined : rateToneClass(m.compliancePct)}
                detail={m.answersChecked > 0 ? `${m.answersChecked} answers checked` : 'No scored answers in this period'}
                hint="Compliance: checked answers that were right"
              />
              <BigStat
                label="Sent back"
                value={String(m.sentBack)}
                valueClassName={m.sentBack > 0 ? 'text-warning' : undefined}
                detail={`of ${m.assigned} ${m.assigned === 1 ? 'checklist' : 'checklists'}`}
              />
            </div>
            {!!m.open && (
              <p className="t-meta font-display font-medium text-text-secondary">
                {m.open} {m.open === 1 ? 'checklist is' : 'checklists are'} still open and not in these percentages yet.
              </p>
            )}
            {m.missed > 0 && (
              <p className="t-meta font-display font-medium text-danger">
                {m.missed} {m.missed === 1 ? 'checklist was' : 'checklists were'} missed: past the cutoff and not finished.
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="team-delegations" className="flex flex-col gap-3">
        <h3 id="team-delegations" className="t-section font-display font-bold text-text">Tickets and delegations</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <BigStat
            label="Completion"
            value={pctText(workRate)}
            valueClassName={workRate === null ? undefined : rateToneClass(workRate)}
            detail={workRate === null ? `None were due ${phrase}` : `${workDone} of ${workDue} due were done`}
            hint="Same as the Scorecard. Waiting for approval is not done yet"
          />
          <div className={STAT_TILE_CLASS}>
            <span className="t-meta font-display font-semibold text-text-muted">Photo proof</span>
            {taskTotals.isPending ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <span className={cn('t-stat font-display font-bold tabular-nums', photo?.photoRate == null ? 'text-text-light' : rateToneClass(photo.photoRate))}>
                {formatPct(photo?.photoRate)}
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

        <p className="t-meta font-display text-text-muted">Bars count items created {phrase}: done out of created. They can differ from Completion above, which counts what came due.</p>
        {workLoading ? <Skeleton className="h-40 rounded-xl" /> : <CategoryBarChart bars={bars} />}
      </section>
    </div>
  );
};

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { useComplianceReportQuery } from '../tasks/hook';
import { CATEGORY_PREDICATES } from '../tasks/taskFilters';
import { CategoryBarChart, type CategoryBar } from './CategoryBarChart';
import { type CompliancePeriod, PERIOD_LABEL, bucketKeyFor, periodStartDate } from '../dashboard/dashboardDisplay';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '../../components/ui/dropdown-menu';
import { csvBlob, xlsxBlob, downloadBlob, stampedFilename, type TableRows } from '../../lib/exportTable';
import type { Task } from '../../api/task';
import type { Ticket } from '../../api/ticket';

interface PersonChecklistViewProps {
  personName: string;
  /** Only used for the export sheet's "Department" row now — the back-navigation this prop used
   *  to label ("Back to {departmentName}") is the breadcrumb trail's job now. */
  departmentName: string;
  departmentId: string;
  personId: string;
  tasks: Task[];
  tickets: Ticket[];
}

const PERIOD_OPTIONS: { key: CompliancePeriod; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
];

const isPersons = (id: string | null, personId: string) => id === personId;

// Bar chart broken down by Direct Task / Issue / Delegation / Ticket / Todo Task, each bar
// clickable straight through to that person's filtered list for the selected period — reviewing
// one category no longer means re-deriving the filter by hand. Compliance (photo-evidence) rate
// and the Todo Task bar come from the same checklist-completion aggregation the dashboard's
// Target card uses (task.service.ts's complianceReport), scoped to this one person within this
// department. Completion Rate is computed from the bars themselves (delegations/issues/tickets
// actually marked done) rather than that aggregation — complianceReport only counts TaskChecklist
// sub-items, a rarely-attached feature most tasks don't use, which made this card read "—" for
// almost everyone even when they had plenty of completed work.
export const PersonChecklistView = ({ personName, departmentName, departmentId, personId, tasks, tickets }: PersonChecklistViewProps) => {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<CompliancePeriod>('month');
  const { data: complianceRows, isPending } = useComplianceReportQuery(period, undefined, undefined, departmentId, personId);

  const now = useMemo(() => new Date(), []);
  const currentBucket = complianceRows?.find(r => r.bucket === bucketKeyFor(period, now));

  const complianceRate = currentBucket?.qualityRate ?? null;

  const periodTasks = useMemo(() => {
    const start = periodStartDate(period, now);
    return tasks.filter(t =>
      t.departmentId === departmentId
      && (isPersons(t.assigneeId, personId) || isPersons(t.userId, personId) || t.additionalAssigneeIds.includes(personId))
      && new Date(t.createdAt) >= start,
    );
  }, [tasks, personId, departmentId, period, now]);

  const periodTickets = useMemo(() => {
    const start = periodStartDate(period, now);
    return tickets.filter(t =>
      t.departmentId === departmentId
      && (isPersons(t.assigneeId, personId) || isPersons(t.userId, personId))
      && new Date(t.createdAt) >= start,
    );
  }, [tickets, personId, departmentId, period, now]);

  const goToTasks = (category: 'task' | 'issue' | 'delegation') =>
    navigate(`/tasks?assigneeIds=${personId}&category=${category}`);
  const goToTickets = () => navigate(`/tickets?assigneeIds=${personId}`);

  const countDoneTotal = (list: Task[]) => ({ done: list.filter(t => t.status === 'done').length, total: list.length });
  const taskStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.task));
  const issueStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.issue));
  const delegationStats = countDoneTotal(periodTasks.filter(CATEGORY_PREDICATES.delegation));
  const ticketStats = { done: periodTickets.filter(t => t.status === 'CLOSED').length, total: periodTickets.length };

  // Every task (any category) + every ticket, done vs. total — see the file-level comment above
  // for why this replaced the complianceReport-sourced figure.
  const completionDone = taskStats.done + issueStats.done + delegationStats.done + ticketStats.done;
  const completionTotal = taskStats.total + issueStats.total + delegationStats.total + ticketStats.total;
  const completionRate = completionTotal > 0 ? Math.round((completionDone / completionTotal) * 100) : null;

  // Todo-list usage: how many of this person's checklist items (across all their tasks, any
  // category) are done vs total for the selected period — the same doneItems/totalItems the
  // Completion Rate card above already gets from complianceReport, just surfaced as its own bar.
  const todoStats = { done: currentBucket?.doneItems ?? 0, total: currentBucket?.totalItems ?? 0 };

  const buildExportRows = (): TableRows => [
    ['Checklist activity export'],
    ['Generated', new Date().toLocaleString()],
    ['Person', personName],
    ['Department', departmentName],
    ['Period', PERIOD_LABEL[period]],
    [],
    ['Metric', 'Value'],
    ['Completion rate', completionRate === null ? 'No data' : `${completionRate}%`],
    ['Compliance rate (photo evidence)', complianceRate === null ? 'No data' : `${complianceRate}%`],
    [],
    ['Category', 'Done', 'Total'],
    ['Direct Task', taskStats.done, taskStats.total],
    ['Issue', issueStats.done, issueStats.total],
    ['Delegation', delegationStats.done, delegationStats.total],
    ['Ticket', ticketStats.done, ticketStats.total],
    ['Todo Task (checklist items)', todoStats.done, todoStats.total],
  ];

  const handleExport = (format: 'csv' | 'xlsx') => {
    const rows = buildExportRows();
    const blob = format === 'csv' ? csvBlob(rows) : xlsxBlob(rows, 'Checklist Activity');
    downloadBlob(blob, stampedFilename(`${personName.toLowerCase().replace(/\s+/g, '-')}-checklist-activity`, format));
    toast.success(`Checklist activity exported as ${format.toUpperCase()}`);
  };

  const bars: CategoryBar[] = [
    { key: 'task', label: 'Direct Task', barClassName: 'bg-primary-500', onClick: () => goToTasks('task'), ...taskStats },
    { key: 'issue', label: 'Issue', barClassName: 'bg-danger', onClick: () => goToTasks('issue'), ...issueStats },
    { key: 'delegation', label: 'Delegation', barClassName: 'bg-info', onClick: () => goToTasks('delegation'), ...delegationStats },
    { key: 'ticket', label: 'Ticket', barClassName: 'bg-coral-500', onClick: goToTickets, ...ticketStats },
    { key: 'todo', label: 'Todo Task', barClassName: 'bg-warning', onClick: () => navigate(`/tasks?assigneeIds=${personId}`), ...todoStats },
  ];

  return (
    <div className="flex flex-col gap-4">
      {isPending ? (
        <div className="h-[340px] rounded-2xl border border-border bg-surface animate-pulse" />
      ) : (
        <div className="rounded-2xl border border-border/60 bg-surface p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-display font-bold text-text tracking-tight">{personName}</h2>
              <p className="text-xs font-display font-medium text-text-muted mt-0.5">Checklist activity by type, {PERIOD_LABEL[period]}</p>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-surface-hover border border-border/50">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setPeriod(opt.key)}
                    className={`px-2.5 py-1 rounded-md text-xs font-display font-medium transition-colors cursor-pointer ${
                      period === opt.key ? 'bg-surface text-text border border-border/60' : 'text-text-muted hover:text-text'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Downloads exactly what's on screen — same numbers the two rate cards and the bar
                  chart below are showing, generated in the browser (see lib/exportTable), not a
                  server recomputation that could disagree with what this person is looking at. */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Export this person's checklist activity"
                    className="inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-lg border border-border/60 bg-surface text-xs font-display font-semibold text-text-secondary hover:bg-surface-hover hover:border-border hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 transition-all duration-200 cursor-pointer"
                  >
                    <Download size={13} strokeWidth={2.5} />
                    Export
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-48">
                  <DropdownMenuItem onClick={() => handleExport('csv')} className="gap-2">
                    <FileText size={14} />
                    CSV (.csv)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('xlsx')} className="gap-2">
                    <FileSpreadsheet size={14} />
                    Excel (.xlsx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1 p-4 rounded-lg bg-surface-hover/50">
              <span className="text-xs font-display text-text-muted font-medium">Completion Rate</span>
              <span className="text-2xl font-display font-bold text-text tabular-nums">
                {completionRate === null ? '—' : `${completionRate}%`}
              </span>
              <span className="text-[11px] font-display font-medium text-text-muted">
                {completionRate === null ? `No delegations, issues, or tickets ${PERIOD_LABEL[period]}` : 'Delegations, issues & tickets marked done'}
              </span>
            </div>
            <div className="flex flex-col gap-1 p-4 rounded-lg bg-surface-hover/50">
              <span className="text-xs font-display text-text-muted font-medium">Compliance Rate</span>
              <span className="text-2xl font-display font-bold text-text tabular-nums">
                {complianceRate === null ? '—' : `${complianceRate}%`}
              </span>
              <span className="text-[11px] font-display font-medium text-text-muted">
                {complianceRate === null ? 'No photo-evidence checklist items this period' : 'Required evidence photos uploaded'}
              </span>
            </div>
          </div>

          <CategoryBarChart bars={bars} />
        </div>
      )}
    </div>
  );
};

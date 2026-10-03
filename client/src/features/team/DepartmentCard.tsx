import { Building2, ChevronRight, Users } from 'lucide-react';
import { EntityIconTile } from '../../components';
import type { ChecklistReportMetrics } from '../../api/checklistReports';
import { CardFooter, CompletionRing } from './TeamCardParts';
import { TEAM_CARD_CLASS, TEAM_CARD_LINK_CLASS, staggerStyle, summarizeCard, type OverdueItem, type ReportState } from './teamDisplay';

export interface DepartmentCardRow {
  id: string;
  name: string;
  headcount: number;
  /** Tickets and delegations (all-time) that are still open. */
  openTickets: number;
  openTasks: number;
  overdueItems: OverdueItem[];
  /** Closed tickets + done delegations, over every ticket/delegation raised for this department. */
  workDone: number;
  workTotal: number;
}

interface DepartmentCardProps {
  row: DepartmentCardRow;
  /** This department's row from the checklist report; undefined means no checklist ran for it. */
  checklist: ChecklistReportMetrics | undefined;
  reportState: ReportState;
  onClick: () => void;
  index?: number;
}

export const DepartmentCard = ({ row, checklist, reportState, onClick, index = 0 }: DepartmentCardProps) => {
  const numbers = summarizeCard({ done: row.workDone, total: row.workTotal, overdue: row.overdueItems.length }, checklist, reportState);

  return (
    <div className={`${TEAM_CARD_CLASS} cursor-pointer`} style={staggerStyle(index)}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <EntityIconTile icon={Building2} className="size-9 rounded-lg" />
          <div className="min-w-0 flex flex-col gap-0.5">
            <h3 className="flex items-start gap-1 min-w-0">
              {/* line-clamp-3: on a narrow card the fixed-width ring leaves little room per line, and
                  the longest real name ("Inventory & Procurement") needs the wrap. */}
              <button type="button" onClick={onClick} title={row.name} className={`${TEAM_CARD_LINK_CLASS} line-clamp-3`}>
                {row.name}
              </button>
              <ChevronRight size={13} aria-hidden className="shrink-0 mt-1 text-text-light opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200 ease-in-out" />
            </h3>
            <p className="flex items-center gap-1.5 text-xs font-display font-medium text-text-muted">
              <Users size={12} aria-hidden />
              {row.headcount} {row.headcount === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>
        <CompletionRing numbers={numbers} state={reportState} />
      </div>

      <CardFooter openTickets={row.openTickets} openTasks={row.openTasks} overdueItems={row.overdueItems} numbers={numbers} state={reportState} />
    </div>
  );
};

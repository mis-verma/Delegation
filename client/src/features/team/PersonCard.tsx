import { ChevronRight } from 'lucide-react';
import { getInitials } from '../../lib/getInitials';
import { avatarColorClass } from '../../lib/avatarColors';
import type { ChecklistReportMetrics } from '../../api/checklistReports';
import { CardFooter, ScoreFigure } from './TeamCardParts';
import { TEAM_CARD_CLASS, TEAM_CARD_LINK_CLASS, summarizeCard, type OverdueItem, type ReportState } from './teamDisplay';

export interface PersonCardRow {
  id: string;
  name: string;
  role: string;
  openTickets: number;
  openTasks: number;
  overdueItems: OverdueItem[];
  /** Closed tickets + done delegations, over this person's tickets/delegations in the selected
   *  department and period (selectPersonWork, the same rule as the person screen). */
  workDone: number;
  workTotal: number;
}

interface PersonCardProps {
  row: PersonCardRow;
  /** This person's row from the checklist report; undefined means no checklist ran for them. */
  checklist: ChecklistReportMetrics | undefined;
  reportState: ReportState;
  onClick: () => void;
}

export const PersonCard = ({ row, checklist, reportState, onClick }: PersonCardProps) => {
  const numbers = summarizeCard({ done: row.workDone, total: row.workTotal, overdue: row.overdueItems.length }, checklist, reportState);

  return (
    <div className={TEAM_CARD_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <div className={`flex items-center justify-center size-9 rounded-full text-white t-meta font-bold shrink-0 ${avatarColorClass(row.name)}`}>
            {getInitials(row.name)}
          </div>
          <div className="min-w-0 flex flex-col gap-0.5">
            <h3 className="flex items-center gap-1 min-w-0">
              <button type="button" onClick={onClick} title={row.name} className={TEAM_CARD_LINK_CLASS}>
                {row.name}
              </button>
              <ChevronRight size={13} aria-hidden className="shrink-0 text-text-light" />
            </h3>
            <p className="t-meta font-display font-medium text-text-muted line-clamp-1">{row.role}</p>
          </div>
        </div>
        <ScoreFigure numbers={numbers} state={reportState} />
      </div>

      <CardFooter openTickets={row.openTickets} openTasks={row.openTasks} overdueItems={row.overdueItems} numbers={numbers} state={reportState} />
    </div>
  );
};

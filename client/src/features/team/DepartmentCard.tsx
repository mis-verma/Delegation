import { Building2, ChevronRight, Users } from 'lucide-react';
import { EntityIconTile } from '../../components';
import type { ScoreReportRow } from '../../api/scores';
import { CardFooter, ScoreFigure } from './TeamCardParts';
import { TEAM_CARD_CLASS, TEAM_CARD_LINK_CLASS, summarizeCard, type OverdueItem, type ReportState } from './teamDisplay';

export interface DepartmentCardRow {
  id: string;
  name: string;
  headcount: number;
  /** Tickets and delegations open today, whenever they were raised ("Open now"). */
  openTickets: number;
  openTasks: number;
  /** Open and past due today. */
  overdueItems: OverdueItem[];
}

interface DepartmentCardProps {
  row: DepartmentCardRow;
  /** This department's row from the scores report (the Scorecard's numbers); undefined means nothing was due. */
  scores: ScoreReportRow | undefined;
  reportState: ReportState;
  onClick: () => void;
}

export const DepartmentCard = ({ row, scores, reportState, onClick }: DepartmentCardProps) => {
  const numbers = summarizeCard(scores, reportState);

  return (
    <div className={TEAM_CARD_CLASS}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-0">
          <EntityIconTile icon={Building2} className="size-9 rounded-lg" />
          <div className="min-w-0 flex flex-col gap-0.5">
            {/* line-clamp-2 (in TEAM_CARD_LINK_CLASS): the score figure is narrower than the old
                ring, so even the longest real name ("Inventory & Procurement") fits in two lines. */}
            <h3 className="flex items-center gap-1 min-w-0">
              <button type="button" onClick={onClick} title={row.name} className={TEAM_CARD_LINK_CLASS}>
                {row.name}
              </button>
              <ChevronRight size={13} aria-hidden className="shrink-0 text-text-light" />
            </h3>
            <p className="flex items-center gap-1.5 t-meta font-display font-medium text-text-muted">
              <Users size={12} aria-hidden />
              {row.headcount} {row.headcount === 1 ? 'person' : 'people'}
            </p>
          </div>
        </div>
        <ScoreFigure numbers={numbers} state={reportState} />
      </div>

      <CardFooter openTickets={row.openTickets} openTasks={row.openTasks} overdueItems={row.overdueItems} numbers={numbers} state={reportState} />
    </div>
  );
};

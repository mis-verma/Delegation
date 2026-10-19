
export type ScoreModule = 'checklist' | 'ticket' | 'delegation';
export type ScoreFigure = 'completion' | 'compliance' | 'onTime' | 'metDeadline' | 'overall' | 'itemsDone';

export const MODULE_LABEL: Record<ScoreModule, string> = { checklist: 'Checklists', ticket: 'Tickets', delegation: 'Delegations' };
const UNIT: Record<ScoreModule, string> = { checklist: 'checklist runs', ticket: 'tickets', delegation: 'delegations' };

export const SCORE_LABEL = {
  completion: 'Completion',
  compliance: 'Compliance',
  onTime: 'On time',
  metDeadline: 'Met deadline',
  overall: 'Overall score',
  itemsDone: 'Items done %',
  notDone: 'Not done',
  late: 'Late',
  open: 'Open',
  done: 'Done',
  due: 'Due',
} as const;

export const SCORE_LABEL_SHORT = {
  completion: 'Done',
  compliance: 'Right',
  onTime: 'On time',
  metDeadline: 'Met',
  overall: 'Overall',
  itemsDone: 'Items',
  notDone: 'Not done',
  late: 'Late',
  open: 'Open',
  done: 'Done',
  due: 'Due',
} as const;

export const complianceLabel = (module: ScoreModule): string => (module === 'checklist' ? 'Answers right' : SCORE_LABEL.metDeadline);
export const complianceLabelShort = (module: ScoreModule): string => (module === 'checklist' ? 'Right' : SCORE_LABEL_SHORT.metDeadline);

export const figureLabel = (figure: ScoreFigure, module?: ScoreModule): string =>
  figure === 'compliance' && module ? complianceLabel(module) : SCORE_LABEL[figure];

export interface HowLines {
  counted: string;
  dividedBy: string;
  dates: string;
  leftOut: string;
}

export const HOW_LINE_LABEL: Record<keyof HowLines, string> = {
  counted: 'Counted',
  dividedBy: 'Divided by',
  dates: 'Dates',
  leftOut: 'Left out',
};
export const HOW_LINE_ORDER: readonly (keyof HowLines)[] = ['counted', 'dividedBy', 'dates', 'leftOut'];

const WINDOW_NOTE = 'never later than today';

const DATES: Record<ScoreModule, string> = {
  checklist: `Runs whose cutoff falls in the days you picked (${WINDOW_NOTE}).`,
  ticket: `Tickets whose due time falls in the days you picked (${WINDOW_NOTE}).`,
  delegation: `Delegations whose due date falls in the days you picked (${WINDOW_NOTE}).`,
};

const DUE_DEF: Record<ScoreModule, string> = {
  checklist: 'Runs that have come due: the cutoff has passed, or the run was completed.',
  ticket: 'Tickets due in the window.',
  delegation: 'Delegations due in the window.',
};

const LEFT_OUT: Record<ScoreModule, string> = {
  checklist: 'Runs still open before their cutoff, runs of deleted checklists, runs with no questions, and daily runs left unfinished on a holiday.',
  ticket: 'Tickets still ahead of their due time and not closed, and tickets with no due time. A ticket waiting for approval is not closed until approved.',
  delegation: 'Delegations still ahead of their due date and not done, subtasks, issues and drafts. One waiting for approval is not done until approved.',
};

export const howCalculated = (figure: ScoreFigure, module?: ScoreModule): HowLines => {
  const m: ScoreModule = module ?? 'checklist';
  const unit = UNIT[m];
  switch (figure) {
    case 'completion':
      return {
        counted: m === 'checklist' ? 'Checklist runs that were completed.' : m === 'ticket' ? 'Tickets that were closed.' : 'Delegations that were done.',
        dividedBy: DUE_DEF[m],
        dates: DATES[m],
        leftOut: LEFT_OUT[m],
      };
    case 'compliance':
      return m === 'checklist'
        ? {
            counted: 'Checked answers that were right. Critical questions count double.',
            dividedBy: 'All checked answers (critical double). A sent-back question counts as wrong.',
            dates: DATES.checklist,
            leftOut: 'Not applicable answers. It is never an average of people’s percentages: the answers are pooled.',
          }
        : {
            counted: `${m === 'ticket' ? 'Tickets' : 'Delegations'} finished on time, plus those handed in on time and waiting for approval.`,
            dividedBy: DUE_DEF[m],
            dates: DATES[m],
            leftOut: LEFT_OUT[m],
          };
    case 'metDeadline':
      return {
        counted: m === 'checklist' ? 'Runs completed before their cutoff.' : `${m === 'ticket' ? 'Tickets' : 'Delegations'} finished on time, plus those handed in on time and waiting for approval.`,
        dividedBy: DUE_DEF[m],
        dates: DATES[m],
        leftOut: `${LEFT_OUT[m]} Late and unfinished items both count against it.`,
      };
    case 'onTime':
      return {
        counted: `Finished ${unit} that were finished before their deadline.`,
        dividedBy: `All finished ${unit}.`,
        dates: DATES[m],
        leftOut: 'Anything not finished yet, so it can read higher than Met deadline.',
      };
    case 'itemsDone':
      return {
        counted: 'Checklist questions that were ticked done.',
        dividedBy: 'All questions on the runs in the window.',
        dates: DATES.checklist,
        leftOut: 'Questions on runs that are not counted (see Completion).',
      };
    case 'overall':
    default:
      return {
        counted: 'The completion and the second measure (answers right, or met deadline) of every module that has something due, each counted equally.',
        dividedBy: 'The number of those percentages, averaged before any rounding.',
        dates: 'Each module uses its own due date, inside the days you picked (never later than today).',
        leftOut: 'Modules with nothing due. A row is ranked only with at least 5 items due.',
      };
  }
};

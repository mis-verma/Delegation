import type { ChecklistInstanceItem } from '../../api/checklistInstances';

// Two separate numbers for a checklist run:
//  - Completion: how many applicable questions are done. "Not applicable" is neutral, so it is left
//    out of both the done count and the total.
//  - Compliance: of the answered questions that have an "acceptable answer" rule, how many were
//    answered well (e.g. the question wanted Yes and they said No = not compliant). Questions with
//    no rule, not-applicable ones and unanswered ones are not scored at all.

export type AnswerVerdict = 'good' | 'bad';

type Scorable = Pick<
  ChecklistInstanceItem,
  'itemType' | 'isDone' | 'isNotApplicable' | 'booleanAnswer' | 'textValue' | 'numericValue' | 'acceptableAnswers' | 'acceptableMin' | 'acceptableMax'
>;

// null = this question isn't scored (no rule, not answered yet, or not applicable).
export const answerVerdict = (item: Scorable): AnswerVerdict | null => {
  if (!item.isDone || item.isNotApplicable) return null;
  const accepted = item.acceptableAnswers ?? [];
  switch (item.itemType) {
    case 'YES_NO':
    case 'PASS_FAIL':
      if (!accepted.length || !item.booleanAnswer) return null;
      return accepted.includes(item.booleanAnswer) ? 'good' : 'bad';
    case 'MULTIPLE_CHOICE':
    case 'DROPDOWN':
      if (!accepted.length || !item.textValue) return null;
      return accepted.includes(item.textValue) ? 'good' : 'bad';
    case 'NUMBER_ENTRY':
    case 'RATING': {
      const { acceptableMin: min, acceptableMax: max, numericValue: value } = item;
      if ((min == null && max == null) || value == null) return null;
      return (min == null || value >= min) && (max == null || value <= max) ? 'good' : 'bad';
    }
    default:
      return null;
  }
};

export type RunScores = {
  /** Applicable questions done / applicable questions (N/A excluded). */
  done: number;
  total: number;
  completion: number;
  /** null when no answered question has an acceptable-answer rule. */
  compliance: number | null;
  scored: number;
  good: number;
};

export const runScores = (items: Scorable[]): RunScores => {
  const applicable = items.filter(i => !i.isNotApplicable);
  const done = applicable.filter(i => i.isDone).length;
  const verdicts = items.map(answerVerdict).filter((v): v is AnswerVerdict => v !== null);
  const good = verdicts.filter(v => v === 'good').length;
  return {
    done,
    total: applicable.length,
    // A run made only of "not applicable" questions has nothing left to do.
    completion: applicable.length ? Math.round((done / applicable.length) * 100) : items.length ? 100 : 0,
    compliance: verdicts.length ? Math.round((good / verdicts.length) * 100) : null,
    scored: verdicts.length,
    good,
  };
};

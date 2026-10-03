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
  // One pass: this runs once per card/row on every list render.
  let total = 0;
  let done = 0;
  let scored = 0;
  let good = 0;
  for (const item of items) {
    if (!item.isNotApplicable) {
      total += 1;
      if (item.isDone) done += 1;
    }
    const verdict = answerVerdict(item);
    if (verdict !== null) {
      scored += 1;
      if (verdict === 'good') good += 1;
    }
  }
  return {
    done,
    total,
    // A run made only of "not applicable" questions has nothing left to do.
    completion: total ? Math.round((done / total) * 100) : items.length ? 100 : 0,
    compliance: scored ? Math.round((good / scored) * 100) : null,
    scored,
    good,
  };
};

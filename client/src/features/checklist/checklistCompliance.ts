import type { ChecklistInstanceItem } from '../../api/checklistInstances';

// Two separate numbers for a checklist run:
//  - Completion: how many applicable questions are done. "Not applicable" is neutral, so it is left
//    out of both the done count and the total.
//  - Compliance: of the answered questions that have an "acceptable answer" rule, how many were
//    answered well (e.g. the question wanted Yes and they said No = not compliant). Questions with
//    no rule, not-applicable ones and unanswered ones are not scored at all.
//    A question a reviewer sent back counts as a FAILED check even if it was redone well later and
//    even if it has no rule: it was not done right the first time, so it stays deducted.
//    A critical question (isCritical) counts DOUBLE: its scored weight and good weight are both x2,
//    so one failed critical hurts the % twice as much. `scored`/`good` stay raw counts (captions).

export type AnswerVerdict = 'good' | 'bad';

type Scorable = Pick<
  ChecklistInstanceItem,
  'itemType' | 'isDone' | 'isNotApplicable' | 'sendBackCount' | 'booleanAnswer' | 'textValue' | 'numericValue' | 'acceptableAnswers' | 'acceptableMin' | 'acceptableMax'
> & { isCritical?: boolean; waivedAt?: string | null; waiveReason?: string | null };

// null = this question isn't scored (no rule, not answered yet, or not applicable).
export const answerVerdict = (item: Scorable): AnswerVerdict | null => {
  if (item.isNotApplicable) return null;
  // Waived by a reviewer: left out of compliance entirely, like not applicable.
  if (item.waivedAt) return null;
  // Sent back by a reviewer at least once: a failed check, whatever the current answer is.
  if (item.sendBackCount > 0) return 'bad';
  if (!item.isDone) return null;
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

const BOOLEAN_LABEL: Record<string, Record<string, string>> = {
  YES_NO: { YES: 'Yes', NO: 'No' },
  PASS_FAIL: { YES: 'Pass', NO: 'Fail' },
};

/**
 * Why a question counts against compliance, in words the person can act on, or null when it does not.
 * Names the accepted answer so "Not acceptable" is never a guess. A question sent back and redone still
 * counts, and says so, because the first attempt is what is scored.
 */
export const complianceReason = (item: Scorable): string | null => {
  if (item.isNotApplicable || item.waivedAt) return null;
  if (item.sendBackCount > 0) return item.isDone ? 'Sent back by the reviewer earlier, so it still counts against compliance.' : null;
  if (answerVerdict(item) !== 'bad') return null;
  const accepted = item.acceptableAnswers ?? [];
  if (item.itemType === 'NUMBER_ENTRY' || item.itemType === 'RATING') {
    const { acceptableMin: min, acceptableMax: max } = item;
    const range = min != null && max != null ? `between ${min} and ${max}` : min != null ? `${min} or more` : `${max} or less`;
    return `Counts against compliance. The accepted answer is ${range}.`;
  }
  const labels = BOOLEAN_LABEL[item.itemType];
  const words = accepted.map((a) => labels?.[a] ?? a).join(' or ');
  return `Counts against compliance. The accepted answer is ${words}.`;
};

/** The notice for a waived question, with the reviewer's reason, or null when it is not waived. */
export const waiveNotice = (item: Scorable): string | null =>
  item.waivedAt ? `Waived by a reviewer, so it does not count against compliance.${item.waiveReason ? ` Reason: ${item.waiveReason}` : ''}` : null;

/** True when this question counts against compliance right now (a bad answer or a send-back). */
export const countsAgainstCompliance = (item: Scorable): boolean =>
  !item.isNotApplicable && !item.waivedAt && (item.sendBackCount > 0 || answerVerdict(item) === 'bad');

export type RunScores = {
  /** Applicable questions done / applicable questions (N/A excluded). */
  done: number;
  total: number;
  completion: number;
  /** null when no answered question has an acceptable-answer rule. */
  compliance: number | null;
  /** Raw counts of scored / good answers (for captions); the % above is weighted, critical x2. */
  scored: number;
  good: number;
  /** Critical questions whose verdict is 'bad' (answered badly or sent back). */
  criticalFailed: number;
};

export const runScores = (items: Scorable[]): RunScores => {
  // One pass: this runs once per card/row on every list render.
  let total = 0;
  let done = 0;
  let scored = 0;
  let good = 0;
  let weightedScored = 0;
  let weightedGood = 0;
  let criticalFailed = 0;
  for (const item of items) {
    if (!item.isNotApplicable) {
      total += 1;
      if (item.isDone) done += 1;
    }
    const verdict = answerVerdict(item);
    if (verdict !== null) {
      const weight = item.isCritical ? 2 : 1;
      scored += 1;
      weightedScored += weight;
      if (verdict === 'good') {
        good += 1;
        weightedGood += weight;
      } else if (item.isCritical) {
        criticalFailed += 1;
      }
    }
  }
  return {
    done,
    total,
    // A run made only of "not applicable" questions has nothing left to do.
    completion: total ? Math.round((done / total) * 100) : items.length ? 100 : 0,
    compliance: weightedScored ? Math.round((weightedGood / weightedScored) * 100) : null,
    scored,
    good,
    criticalFailed,
  };
};

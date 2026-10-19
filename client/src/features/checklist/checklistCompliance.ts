import type { ChecklistInstanceItem } from '../../api/checklistInstances';

export type AnswerVerdict = 'good' | 'bad';

type Scorable = Pick<
  ChecklistInstanceItem,
  'itemType' | 'isDone' | 'isNotApplicable' | 'sendBackCount' | 'booleanAnswer' | 'textValue' | 'numericValue' | 'acceptableAnswers' | 'acceptableMin' | 'acceptableMax'
> & { isCritical?: boolean; waivedAt?: string | null; waiveReason?: string | null };

export const answerVerdict = (item: Scorable): AnswerVerdict | null => {
  if (item.isNotApplicable) return null;
  if (item.waivedAt) return null;
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

export const waiveNotice = (item: Scorable): string | null =>
  item.waivedAt ? `Waived by a reviewer, so it does not count against compliance.${item.waiveReason ? ` Reason: ${item.waiveReason}` : ''}` : null;

export const countsAgainstCompliance = (item: Scorable): boolean =>
  !item.isNotApplicable && !item.waivedAt && (item.sendBackCount > 0 || answerVerdict(item) === 'bad');

export type RunScores = {
  done: number;
  total: number;
  completion: number;
  compliance: number | null;
  scored: number;
  good: number;
  criticalFailed: number;
};

export const runScores = (items: Scorable[]): RunScores => {
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
    completion: total ? Math.round((done / total) * 100) : items.length ? 100 : 0,
    compliance: weightedScored ? Math.round((weightedGood / weightedScored) * 100) : null,
    scored,
    good,
    criticalFailed,
  };
};

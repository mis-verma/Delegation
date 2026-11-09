export const AUDIT_PASS_PCT = 80;
const PASS_FRACTION = AUDIT_PASS_PCT / 100 - 1e-9;

export type AuditPerson = {
  isDone: boolean;
  isNotApplicable: boolean;
  accessories: readonly { checked: boolean }[];
};

export const personAuditScore = (person: AuditPerson): number | null => {
  if (person.isNotApplicable || !person.isDone || person.accessories.length === 0) return null;
  return person.accessories.filter((a) => a.checked).length / person.accessories.length;
};

export const auditItemScore = (people: readonly AuditPerson[] | undefined): number | null => {
  const scores = (people ?? []).map(personAuditScore).filter((s): s is number => s !== null);
  if (!scores.length) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
};

export const auditPasses = (score: number): boolean => score >= PASS_FRACTION;

export const auditPct = (score: number): number => Math.round(score * 100);

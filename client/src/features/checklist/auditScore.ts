export const AUDIT_PASS_PCT = 80;
const PASS_FRACTION = AUDIT_PASS_PCT / 100 - 1e-9;

export type AuditAccessory = { name?: string; checked: boolean; isCritical?: boolean; points?: number | null };

export const accessoryPoints = (a: Pick<AuditAccessory, 'points'>): number => (a.points && a.points > 0 ? a.points : 1);

export const hasCustomPoints = (people: readonly AuditPerson[] | undefined): boolean =>
  (people ?? []).some((p) => p.accessories.some((a) => accessoryPoints(a) !== 1));

export type AuditPerson = {
  isDone: boolean;
  isNotApplicable: boolean;
  accessories: readonly AuditAccessory[];
};

const counts = (person: AuditPerson) => !person.isNotApplicable && person.isDone && person.accessories.length > 0;

export const missedCriticalItems = (person: AuditPerson): string[] =>
  counts(person) ? person.accessories.filter((a) => a.isCritical && !a.checked).map((a) => a.name ?? '') : [];

export const personMissedCritical = (person: AuditPerson): boolean => missedCriticalItems(person).length > 0;

export const personAuditScore = (person: AuditPerson): number | null => {
  if (!counts(person)) return null;
  if (personMissedCritical(person)) return 0;
  const total = person.accessories.reduce((sum, a) => sum + accessoryPoints(a), 0);
  const kept = person.accessories.reduce((sum, a) => sum + (a.checked ? accessoryPoints(a) : 0), 0);
  return kept / total;
};

export const auditItemScore = (people: readonly AuditPerson[] | undefined): number | null => {
  const scores = (people ?? []).map(personAuditScore).filter((s): s is number => s !== null);
  if (!scores.length) return null;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
};

export const auditMissedCritical = (people: readonly AuditPerson[] | undefined): boolean => (people ?? []).some(personMissedCritical);

export const auditPasses = (score: number, missedCritical = false): boolean => !missedCritical && score >= PASS_FRACTION;

export const auditPct = (score: number): number => Math.round(score * 100);

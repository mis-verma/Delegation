import type { TrendBucket } from '../../api/scores';
import { checklistDrillHref, delegationDrillHref, ticketDrillHref, type DrillSubject } from './scoreDrill';
import type { StreakKind } from './useStreak';

export type StreakModule = Exclude<StreakKind, 'all'>;

export interface ModuleDayStat {
  module: StreakModule;
  due: number;
  done: number;
  open: number;
  late: number;
  pct: number | null;
}

export type DayState = 'met' | 'missed' | 'none';

export const dayState = (value: number | null, goal: number): DayState =>
  value === null ? 'none' : value >= goal ? 'met' : 'missed';

const stat = (module: StreakModule, due: number, done: number, late: number, pct: number | null): ModuleDayStat => ({
  module,
  due,
  done,
  open: Math.max(0, due - done),
  late,
  pct: due > 0 ? pct : null,
});

export const moduleDayStats = (b: TrendBucket): ModuleDayStat[] => [
  stat('checklist', b.checklist.due, b.checklist.done ?? b.checklist.completed, b.checklist.late ?? 0, b.checklist.completionPct),
  stat('ticket', b.ticket.due, b.ticket.done ?? b.ticket.closed, b.ticket.late, b.ticket.completionPct),
  stat('delegation', b.delegation.due, b.delegation.done, b.delegation.late ?? 0, b.delegation.completionPct),
];

export interface DayFixLink {
  href: string;
  label: string;
}

interface FixContext {
  userId: string;
  day: string;
  today: string;
  canSeeHistory: boolean;
}

export const dayFixLink = (s: ModuleDayStat, { userId, day, today, canSeeHistory }: FixContext): DayFixLink | null => {
  const me: DrillSubject = { kind: 'person', id: userId };
  if (s.open > 0) {
    const label = `Open ${s.open} unfinished`;
    if (s.module === 'ticket') return { href: ticketDrillHref(false, me, day, day, 'notDone'), label };
    if (s.module === 'delegation') return { href: delegationDrillHref(me, day, day, 'notDone'), label };
    if (day === today) return { href: '/checklists', label: "Fill today's checklists" };
    return canSeeHistory ? { href: checklistDrillHref(false, me, day, day, 'notDone'), label } : null;
  }
  if (s.late > 0) {
    const label = `See ${s.late} done late`;
    if (s.module === 'ticket') return { href: ticketDrillHref(false, me, day, day, 'late'), label };
    if (s.module === 'delegation') return { href: delegationDrillHref(me, day, day, 'late'), label };
    return canSeeHistory ? { href: checklistDrillHref(false, me, day, day, 'late'), label } : null;
  }
  return null;
};

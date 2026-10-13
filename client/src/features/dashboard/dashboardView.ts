import { OWN_SCOPE_ROLES, type Role } from '../../api/auth';
import { DEFAULT_CARD_ORDER, FRONT_LINE_CARD_ORDER, type DashboardCardId } from './dashboardLayout';

/** Two dashboards: the front-line one (User, Agent: their own work only) and the admin one (everyone else). */
export type DashboardView = 'user' | 'admin';

export interface DashboardViewConfig {
  view: DashboardView;
  /** User and Agent. Their dashboard shows only their own work and never an org-wide number. */
  frontLine: boolean;
  /** Admin and PC: the organisation. */
  orgWide: boolean;
  /** Manager and Senior: heads of a department. */
  isHod: boolean;
  /** The default card order, and what "Reset to default" returns to. */
  order: readonly DashboardCardId[];
  /** Saved layouts live under a key of their own per view, so a person never inherits the other view's order. */
  layoutKeyPrefix: string;
  /** Org-wide oversight cards (Compliance, Compare dashboard) are for Admin and PC only. */
  showOversightCards: boolean;
  scores: {
    /** The simple card: bars for Week or Month, no views, measures, people or compare. */
    simple: boolean;
    /** Export of the scores card. Admin and PC, and the heads' department report. Never User or Agent. */
    canExport: boolean;
    /** Pick another person, department or store, and see the ranking. */
    canPickPeople: boolean;
    /** The Bars / Dials / Trend switch, the measure tabs and Compare. */
    hasViewControls: boolean;
  };
}

/**
 * The one place the dashboard splits by role. HomePage, MyScoresCard and useDashboardLayout all read this,
 * so a role is never judged in three places with three slightly different rules.
 *
 * Manager and Senior keep the non-front-line dashboard with their department report. Any other role that is
 * not front-line (Approval manager) gets the same dashboard without an export.
 */
export const dashboardViewFor = (role: Role | undefined): DashboardViewConfig => {
  const frontLine = !!role && OWN_SCOPE_ROLES.includes(role);
  const orgWide = role === 'ADMIN' || role === 'PC';
  const isHod = role === 'MANAGER' || role === 'SENIOR';
  return {
    view: frontLine ? 'user' : 'admin',
    frontLine,
    orgWide,
    isHod,
    order: frontLine ? FRONT_LINE_CARD_ORDER : DEFAULT_CARD_ORDER,
    layoutKeyPrefix: frontLine ? 'tm-dashboard-layout-user' : 'tm-dashboard-layout',
    showOversightCards: orgWide,
    scores: {
      simple: frontLine,
      canExport: orgWide || isHod,
      canPickPeople: !!role && !frontLine,
      hasViewControls: !frontLine,
    },
  };
};

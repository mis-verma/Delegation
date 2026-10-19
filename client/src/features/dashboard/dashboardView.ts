import { OWN_SCOPE_ROLES, type Role } from '../../api/auth';
import { DEFAULT_CARD_ORDER, FRONT_LINE_CARD_ORDER, type DashboardCardId } from './dashboardLayout';

export type DashboardView = 'user' | 'admin';

export interface DashboardViewConfig {
  view: DashboardView;
  frontLine: boolean;
  orgWide: boolean;
  isHod: boolean;
  order: readonly DashboardCardId[];
  layoutKeyPrefix: string;
  showOversightCards: boolean;
  scores: {
    simple: boolean;
    canExport: boolean;
    canPickPeople: boolean;
    hasViewControls: boolean;
  };
}

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

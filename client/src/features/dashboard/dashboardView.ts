import { OWN_SCOPE_ROLES, type Role } from '../../api/auth';

interface DashboardViewConfig {
  frontLine: boolean;
  orgWide: boolean;
  isHod: boolean;
  scores: {
    simple: boolean;
    canExport: boolean;
    canPickPeople: boolean;
    hasViewControls: boolean;
  };
}

export const dashboardViewFor = (role: Role | undefined): DashboardViewConfig => {
  const frontLine = !!role && OWN_SCOPE_ROLES.includes(role);
  const orgWide = role === 'ADMIN' || role === 'PC' || role === 'OWNER';
  const isHod = role === 'MANAGER' || role === 'SENIOR';
  return {
    frontLine,
    orgWide,
    isHod,
    scores: {
      simple: frontLine,
      canExport: orgWide || isHod,
      canPickPeople: !!role && !frontLine,
      hasViewControls: !frontLine,
    },
  };
};

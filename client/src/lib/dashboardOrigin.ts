const KEY = 'karya.dashboardOrigin';

interface DashboardOrigin {
  to: string;
  back: string;
}

const pathOf = (href: string) => href.split(/[?#]/)[0] ?? href;

export const rememberDashboardOrigin = (href: string): void => {
  try {
    const origin: DashboardOrigin = { to: pathOf(href), back: `${window.location.pathname}${window.location.search}` };
    window.sessionStorage.setItem(KEY, JSON.stringify(origin));
  } catch {
    return;
  }
};

export const readDashboardOrigin = (): DashboardOrigin | null => {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DashboardOrigin) : null;
  } catch {
    return null;
  }
};

export const clearDashboardOrigin = (): void => {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    return;
  }
};

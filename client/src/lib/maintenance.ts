import { useQuery } from '@tanstack/react-query';
import { settingApi } from '../api/settings';

const parsePages = (raw: string): string[] =>
  raw
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean)
    .map((path) => `/${path.replace(/^\/+|\/+$/g, '')}`);

export const MAINTENANCE_ALL = import.meta.env.VITE_MAINTENANCE_MODE === 'true';

const MAINTENANCE_PAGES = parsePages(import.meta.env.VITE_MAINTENANCE_PAGES ?? '');

export const isPathUnderMaintenance = (pathname: string): boolean =>
  MAINTENANCE_PAGES.some((page) => (page === '/' ? pathname === '/' : pathname === page || pathname.startsWith(`${page}/`)));

export const maintenancePageLabel = (pathname: string): string => {
  const segment = pathname.split('/').filter(Boolean)[0];
  if (!segment) return 'This page';
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const usePublicSettingsQuery = () =>
  useQuery({
    queryKey: ['public-settings'],
    queryFn: () => settingApi.status().then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

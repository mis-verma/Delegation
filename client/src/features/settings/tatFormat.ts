import type { Category, CategoryTatRow } from '../../api/categories';

export const formatMinutes = (minutes: number | null): string => {
  if (minutes === null) return '–';
  const total = Math.round(minutes);
  if (total < 60) return `${total}m`;
  if (total < 1440) {
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
};

export const formatTatHours = (hours: number | null): string => {
  if (hours === null) return 'Default due time';
  return hours % 24 === 0 ? `${hours / 24}d` : `${hours}h`;
};

export type SlaTone = 'good' | 'fair' | 'low' | 'none';

export const slaTone = (percent: number | null): SlaTone => {
  if (percent === null) return 'none';
  if (percent >= 80) return 'good';
  if (percent >= 60) return 'fair';
  return 'low';
};

export const SLA_TEXT: Record<SlaTone, string> = {
  good: 'text-vivid-green-text',
  fair: 'text-vivid-blue-text',
  low: 'text-vivid-red-text',
  none: 'text-text-muted',
};

export const SLA_BAR: Record<SlaTone, string> = {
  good: 'bg-vivid-green',
  fair: 'bg-vivid-blue',
  low: 'bg-vivid-red',
  none: 'bg-border',
};

export const TAT_EXPORT_HEADER = [
  'Category',
  'Department',
  'Total Tickets',
  'Closed',
  'Rejected',
  'Open/InProgress/OnHold',
  'Avg Response TAT (Min)',
  'Median Response TAT (Min)',
  'P90 Response TAT (Min)',
  'Avg Completion TAT (Min)',
  'Median Completion TAT (Min)',
  'P90 Completion TAT (Min)',
  'Avg Closure TAT (Min)',
  'Median Closure TAT (Min)',
  'P90 Closure TAT (Min)',
  'Avg OnHold TAT (Min)',
  'Current TAT (Hours)',
  'Suggested TAT (Hours)',
  'SLA Met Count',
  'SLA Breached Count',
  'SLA Met %',
] as const;

export const tatExportRow = (row: CategoryTatRow) => [
  row.name,
  row.departmentName,
  row.total,
  row.closed,
  row.rejected,
  row.open,
  row.response.avg,
  row.response.median,
  row.response.p90,
  row.completion.avg,
  row.completion.median,
  row.completion.p90,
  row.closure.avg,
  row.closure.median,
  row.closure.p90,
  row.onHoldAvg,
  row.configuredTatHours,
  row.suggestedTatHours,
  row.slaMet,
  row.slaBreached,
  row.slaMetPct,
];

export const departmentSummary = (c: Category, names: ReadonlyMap<string, string>): string | null => {
  const ids = new Set<string>();
  for (const sub of c.subcategories) if (sub.isActive && sub.departmentId && sub.departmentId !== c.departmentId?.id) ids.add(sub.departmentId);
  if (ids.size === 0) return null;
  const labels = [c.departmentId?.name, ...[...ids].map((id) => names.get(id))].filter((n): n is string => !!n);
  if (labels.length <= 2) return labels.join(', ');
  return `${labels[0]} +${labels.length - 1}`;
};

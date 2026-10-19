import { trendFrom, type Trend } from '../../dashboard';
import { ORG_TZ_OFFSET_MS } from '../../checklist/checklistDisplay';
import type { TatReportRow } from '../../../api/ticket';
import { formatPct, roundPct } from '../../../lib/percent';

export const ANALYTICS_LOCALE = 'en-IN';

type ReportRow = { bucket: string; [key: string]: unknown };

export type DisplayGroupBy = 'day' | 'week' | 'month' | 'year' | 'none';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

const NO_DATA = 'No data';

const RANGE_BUCKET = 'range';

export const formatPercent = (value: number | null | undefined): string =>
  formatPct(value, NO_DATA);

const formatPoints = (delta: number | null | undefined): string => {
  if (delta == null || !Number.isFinite(delta)) return NO_DATA;
  const rounded = Math.round(delta);
  if (rounded === 0) return '0 pts';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)} pts`;
};

export const formatDuration = (hours: number | null | undefined): string => {
  if (hours == null || !Number.isFinite(hours)) return NO_DATA;
  const h = Math.max(0, hours);
  if (h < 48) return `${Number(h.toFixed(1))} h`;
  return `${Math.round(h / 24)} d`;
};

const formatBucket = (bucket: string, groupBy: DisplayGroupBy): string => {
  if (groupBy === 'none' || bucket === RANGE_BUCKET) return 'Selected period';
  if (groupBy === 'day') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket);
    return m ? `${Number(m[3])} ${MONTHS_SHORT[Number(m[2]) - 1] ?? ''}`.trim() : bucket;
  }
  if (groupBy === 'week') {
    const m = /^(\d{4})-W(\d{1,2})$/.exec(bucket);
    return m ? `Wk ${Number(m[2])}` : bucket;
  }
  if (groupBy === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(bucket);
    return m ? `${MONTHS_SHORT[Number(m[2]) - 1] ?? ''} ${m[1]}`.trim() : bucket;
  }
  return bucket;
};

export const statCaption = ({ isPending, isError, hasData, noDataText }: { isPending: boolean; isError: boolean; hasData: boolean; noDataText: string }): string => {
  if (isError) return "Couldn't load";
  if (isPending) return 'Loading';
  if (!hasData) return noDataText;
  return '';
};

const formatDayMonth = (d: Date, withYear: boolean) =>
  `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;

const formatRangeSpan = (from: string | Date, to: string | Date): string => {
  const a = new Date(from);
  const b = new Date(to);
  const withYear = a.getFullYear() !== b.getFullYear() || b.getFullYear() !== new Date().getFullYear();
  return `${formatDayMonth(a, withYear)} to ${formatDayMonth(b, withYear)}`;
};

export const periodHeading = (groupBy: DisplayGroupBy, from?: string, to?: string, now: Date = new Date()): string => {
  if (from && to) return `Selected period: ${formatRangeSpan(from, to)}`;
  if (groupBy === 'day') return 'Today so far';
  if (groupBy === 'week') return 'This week so far';
  if (groupBy === 'year') return `${now.getFullYear()} so far`;
  return `${MONTHS_LONG[now.getMonth()]} so far`;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export const toDateParam = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const parseDateParam = (value: string | null | undefined): Date | null => {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDateParam(date) === value ? date : null;
};

export const defaultWindowLabel = (groupBy: DisplayGroupBy): string => {
  if (groupBy === 'day') return 'Last 30 days';
  if (groupBy === 'week') return 'Last 12 weeks';
  if (groupBy === 'year') return 'Last 12 years';
  return 'Last 12 months';
};

const endOfLocalDay = (y: number, m: number, d: number) => new Date(y, m, d, 23, 59, 59, 999);

export const defaultWindow = (groupBy: DisplayGroupBy, now: Date = new Date()): { from: string; to: string } => {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let from: Date;
  if (groupBy === 'day') from = new Date(y, m, d - 29);
  else if (groupBy === 'week') from = new Date(y, m, d - ((now.getDay() + 6) % 7) - 11 * 7);
  else if (groupBy === 'year') from = new Date(y - 11, 0, 1);
  else from = new Date(y, m - 11, 1);
  return { from: from.toISOString(), to: endOfLocalDay(y, m, d).toISOString() };
};

const orgDayStart = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d) - ORG_TZ_OFFSET_MS);
const orgDayEnd = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d + 1) - ORG_TZ_OFFSET_MS - 1);

export const bucketRange = (bucket: string, groupBy: DisplayGroupBy): { from: string; to: string } | null => {
  if (groupBy === 'none' || bucket === RANGE_BUCKET) return null;
  if (groupBy === 'day') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    return { from: orgDayStart(y, mo, d).toISOString(), to: orgDayEnd(y, mo, d).toISOString() };
  }
  if (groupBy === 'week') {
    const m = /^(\d{4})-W(\d{1,2})$/.exec(bucket);
    if (!m) return null;
    const year = Number(m[1]);
    const jan4Weekday = new Date(Date.UTC(year, 0, 4)).getUTCDay();
    const mondayDay = 4 - ((jan4Weekday + 6) % 7) + (Number(m[2]) - 1) * 7;
    return { from: orgDayStart(year, 0, mondayDay).toISOString(), to: orgDayEnd(year, 0, mondayDay + 6).toISOString() };
  }
  if (groupBy === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(bucket);
    if (!m) return null;
    const [y, mo] = [Number(m[1]), Number(m[2]) - 1];
    return { from: orgDayStart(y, mo, 1).toISOString(), to: orgDayEnd(y, mo + 1, 0).toISOString() };
  }
  const y = Number(bucket);
  if (!Number.isInteger(y)) return null;
  return { from: orgDayStart(y, 0, 1).toISOString(), to: orgDayEnd(y, 11, 31).toISOString() };
};

const isEmptyRow = (row: ReportRow) =>
  row.dueRuns === 0 || row.totalItems === 0 || (row.createdCount === 0 && row.closedCount === 0);

export const withoutEmptyTail = <T extends ReportRow>(rows: T[]): T[] => {
  let end = rows.length;
  while (end > 0 && isEmptyRow(rows[end - 1]) && rows[end - 1].bucket !== RANGE_BUCKET) end -= 1;
  return end === 0 ? rows : rows.slice(0, end);
};

export const describeLatestPeriod = (allRows: ReportRow[] | undefined, groupBy: DisplayGroupBy): { label: string; isWholeRange: boolean } => {
  const rows = allRows && withoutEmptyTail(allRows);
  const latest = rows?.[rows.length - 1];
  if (!rows || !latest) return { label: '', isWholeRange: false };
  if (latest.bucket === RANGE_BUCKET) return { label: formatBucket(RANGE_BUCKET, 'none'), isWholeRange: true };
  const previous = rows[rows.length - 2];
  const current = formatBucket(latest.bucket, groupBy);
  return { label: previous ? `${current} vs ${formatBucket(previous.bucket, groupBy)}` : current, isWholeRange: false };
};

const MAX_POINTS_DAY = 31;
const MAX_POINTS_OTHER = 24;
const MIN_CONTEXT_POINTS = 6;

export const trendBucketLabel = (bucket: string, groupBy: DisplayGroupBy) => formatBucket(bucket, bucket === RANGE_BUCKET ? 'none' : groupBy);

export const visibleTrendPoints = <T extends Record<string, unknown>>(data: T[], seriesKeys: readonly string[], groupBy: DisplayGroupBy): T[] => {
  const recent = data.slice(-(groupBy === 'day' ? MAX_POINTS_DAY : MAX_POINTS_OTHER));
  const firstWithData = recent.findIndex((row) => seriesKeys.some((k) => row[k] != null));
  if (firstWithData <= 0) return recent;
  return recent.slice(Math.min(firstWithData, Math.max(0, recent.length - MIN_CONTEXT_POINTS)));
};

export const trendTrimNote = (total: number, shown: number, groupBy: DisplayGroupBy): string | null => {
  if (shown >= total) return null;
  const unit = groupBy === 'day' ? 'day' : groupBy === 'week' ? 'week' : groupBy === 'month' ? 'month' : groupBy === 'year' ? 'year' : 'period';
  const max = groupBy === 'day' ? MAX_POINTS_DAY : MAX_POINTS_OTHER;
  return total > max
    ? `Showing the latest ${shown} of ${total} ${unit}s. Pick a shorter period to see the rest.`
    : `Starts at the first ${unit} with figures.`;
};

export type ValueTone = 'success' | 'warning' | 'danger';

export const pctTone = (value: number | null | undefined): ValueTone | undefined =>
  value == null || !Number.isFinite(value) ? undefined : value >= 80 ? 'success' : value >= 50 ? 'warning' : 'danger';

export const countTone = (count: number | null | undefined): ValueTone | undefined => (count == null ? undefined : count > 0 ? 'danger' : 'success');

export const NO_TREND: Trend = { direction: 'up', label: '—' };

export const spanDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;

export const shiftDay = (day: string, n: number) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const countTrend = (current: number, previous: number): Trend => {
  const delta = current - previous;
  return { direction: delta >= 0 ? 'up' : 'down', label: delta === 0 ? '0' : `${delta > 0 ? '+' : '-'}${Math.abs(delta)}` };
};

export const rateTrend = (current: number, previous: number): Trend => {
  const delta = Math.round(current) - Math.round(previous);
  return { direction: delta >= 0 ? 'up' : 'down', label: formatPoints(delta) };
};

export const slaMetRate = (row?: TatReportRow): number | null => {
  if (!row) return null;
  const denominator = row.closedWithTatCount;
  if (!denominator || denominator <= 0) return null;
  const late = Math.min(row.closedLateCount ?? 0, denominator);
  return roundPct((1 - late / denominator) * 100);
};

const groupByOfBucket = (bucket: string): DisplayGroupBy | null => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return 'day';
  if (/^\d{4}-W\d{1,2}$/.test(bucket)) return 'week';
  if (/^\d{4}-\d{2}$/.test(bucket)) return 'month';
  if (/^\d{4}$/.test(bucket)) return 'year';
  return null;
};

const isBucketOpen = (bucket: string, now: Date): boolean => {
  const unit = groupByOfBucket(bucket);
  const range = unit ? bucketRange(bucket, unit) : null;
  return range != null && new Date(range.to).getTime() > now.getTime();
};

export const latestWithTrend = (
  allRows: ReportRow[] | undefined,
  key: string,
  kind: 'rate' | 'count' = 'count',
  now: Date = new Date(),
): { value: number | null; trend: Trend } => {
  if (!allRows || allRows.length === 0) return { value: null, trend: NO_TREND };
  const rows = withoutEmptyTail(allRows);

  const latest = rows[rows.length - 1];
  const value = (latest[key] as number | null | undefined) ?? null;
  if (value == null) return { value: null, trend: NO_TREND };
  if (latest.bucket === RANGE_BUCKET) return { value, trend: NO_TREND };
  if (kind === 'count' && isBucketOpen(latest.bucket, now)) return { value, trend: NO_TREND };

  const previous = rows.length > 1 ? rows[rows.length - 2] : undefined;
  const previousValue = previous?.[key] as number | null | undefined;
  if (previousValue == null) return { value, trend: NO_TREND };

  return { value, trend: kind === 'rate' ? rateTrend(value, previousValue) : trendFrom(value, previousValue) };
};

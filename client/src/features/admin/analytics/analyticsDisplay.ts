import { trendFrom, type Trend } from '../../dashboard';
import type { TatReportRow } from '../../../api/ticket';

// One place for every number and period label on the Overview page, so the same figure never reads
// two ways (a rate was "76%" in one tile and "75.8%" in the next, a delta was "+4%" when it was
// really four points). One locale for the whole page.
export const ANALYTICS_LOCALE = 'en-IN';

type ReportRow = { bucket: string; [key: string]: unknown };

export type DisplayGroupBy = 'day' | 'week' | 'month' | 'year' | 'none';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

const NO_DATA = 'No data';

/** The name of the single bucket the server returns for groupBy=none. */
export const RANGE_BUCKET = 'range';

// ---------------------------------------------------------------------------------------------
// Number formatters
// ---------------------------------------------------------------------------------------------

/** Whole-number percent: 76 -> "76%". Null or NaN -> "No data". */
export const formatPercent = (value: number | null | undefined): string =>
  value == null || !Number.isFinite(value) ? NO_DATA : `${Math.round(value)}%`;

/** A change in a rate, in percentage points: "+4 pts", "-3 pts", "0 pts". Null -> "No data". */
export const formatPoints = (delta: number | null | undefined): string => {
  if (delta == null || !Number.isFinite(delta)) return NO_DATA;
  const rounded = Math.round(delta);
  if (rounded === 0) return '0 pts';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)} pts`;
};

/** Elapsed hours: "3.5 h" under 48 hours, then whole days ("3 d"). Null -> "No data". */
export const formatDuration = (hours: number | null | undefined): string => {
  if (hours == null || !Number.isFinite(hours)) return NO_DATA;
  const h = Math.max(0, hours);
  if (h < 48) return `${Number(h.toFixed(1))} h`;
  return `${Math.round(h / 24)} d`;
};

// ---------------------------------------------------------------------------------------------
// Period labels
// ---------------------------------------------------------------------------------------------

/** "3 Oct", "Wk 40", "Oct 2026", "2026", or "Selected period" for the single whole-range bucket. */
export const formatBucket = (bucket: string, groupBy: DisplayGroupBy): string => {
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

/**
 * The caption under a tile's number while it has no number to show. Three states a viewer can act
 * on differently: still loading (wait), failed (try again), or loaded but nothing to count (the
 * figure is simply empty for this period). Returns '' once there is a real value.
 */
export const statCaption = ({ isPending, isError, hasData, noDataText }: { isPending: boolean; isError: boolean; hasData: boolean; noDataText: string }): string => {
  if (isError) return "Couldn't load";
  if (isPending) return 'Loading';
  if (!hasData) return noDataText;
  return '';
};

const formatDayMonth = (d: Date, withYear: boolean) =>
  `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;

/** "1 Oct to 14 Oct" (the year is added when the range crosses years or is not this year). */
export const formatRangeSpan = (from: string | Date, to: string | Date): string => {
  const a = new Date(from);
  const b = new Date(to);
  const withYear = a.getFullYear() !== b.getFullYear() || b.getFullYear() !== new Date().getFullYear();
  return `${formatDayMonth(a, withYear)} to ${formatDayMonth(b, withYear)}`;
};

/**
 * Names the period the headline tiles cover. With a range picked it is that range; with none it
 * is the current bucket of the chosen grouping ("October so far").
 */
export const periodHeading = (groupBy: DisplayGroupBy, from?: string, to?: string, now: Date = new Date()): string => {
  if (from && to) return `Selected period: ${formatRangeSpan(from, to)}`;
  if (groupBy === 'day') return 'Today so far';
  if (groupBy === 'week') return 'This week so far';
  if (groupBy === 'year') return `${now.getFullYear()} so far`;
  return `${MONTHS_LONG[now.getMonth()]} so far`;
};

// URL-safe calendar dates ('2026-10-03', browser-local) for the range kept in the page address.
const pad2 = (n: number) => String(n).padStart(2, '0');

export const toDateParam = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** A local-midnight Date from 'YYYY-MM-DD', or null when the text is missing or not a real date. */
export const parseDateParam = (value: string | null | undefined): Date | null => {
  const m = value ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value) : null;
  if (!m) return null;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toDateParam(date) === value ? date : null;
};

/** What the page covers when no range is picked: the server's default window for the grouping. */
export const defaultWindowLabel = (groupBy: DisplayGroupBy): string => {
  if (groupBy === 'day') return 'Last 30 days';
  if (groupBy === 'week') return 'Last 12 weeks';
  if (groupBy === 'year') return 'Last 12 years';
  return 'Last 12 months';
};

const endOfLocalDay = (y: number, m: number, d: number) => new Date(y, m, d, 23, 59, 59, 999);

/**
 * The one explicit window every section shares when no range is picked: the last 12 buckets of the
 * chosen grouping (30 days for Day), ending at the close of today. Same span `defaultWindowLabel`
 * names, so the label and the numbers can never disagree.
 */
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

/**
 * The calendar window a report bucket covers, as ISO strings (browser-local days), so a tile that
 * shows the latest bucket can open the list of exactly those records. Null for the whole-range
 * bucket or a label that does not parse.
 */
export const bucketRange = (bucket: string, groupBy: DisplayGroupBy): { from: string; to: string } | null => {
  if (groupBy === 'none' || bucket === RANGE_BUCKET) return null;
  if (groupBy === 'day') {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
    return { from: new Date(y, mo, d).toISOString(), to: endOfLocalDay(y, mo, d).toISOString() };
  }
  if (groupBy === 'week') {
    const m = /^(\d{4})-W(\d{1,2})$/.exec(bucket);
    if (!m) return null;
    const year = Number(m[1]);
    const jan4 = new Date(year, 0, 4);
    const weekOneMonday = new Date(year, 0, 4 - ((jan4.getDay() + 6) % 7));
    const monday = new Date(weekOneMonday.getFullYear(), weekOneMonday.getMonth(), weekOneMonday.getDate() + (Number(m[2]) - 1) * 7);
    const sunday = endOfLocalDay(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    return { from: monday.toISOString(), to: sunday.toISOString() };
  }
  if (groupBy === 'month') {
    const m = /^(\d{4})-(\d{2})$/.exec(bucket);
    if (!m) return null;
    const [y, mo] = [Number(m[1]), Number(m[2]) - 1];
    return { from: new Date(y, mo, 1).toISOString(), to: endOfLocalDay(y, mo + 1, 0).toISOString() };
  }
  const y = Number(bucket);
  if (!Number.isInteger(y)) return null;
  return { from: new Date(y, 0, 1).toISOString(), to: endOfLocalDay(y, 11, 31).toISOString() };
};

/**
 * The rows up to the newest bucket that actually has data. A report zero-fills the current period,
 * so on the first day of a month its bucket reads "0 runs due" and every tile built from it would
 * say "Nothing counted". A row counts as empty when it reports `dueRuns: 0` (checklists, delegations)
 * or no tickets raised and none closed (tickets), and a report that is empty throughout is left alone.
 */
const isEmptyRow = (row: ReportRow) =>
  row.dueRuns === 0 || (row.createdCount === 0 && row.closedCount === 0);

const withoutEmptyTail = <T extends ReportRow>(rows: T[]): T[] => {
  let end = rows.length;
  while (end > 0 && isEmptyRow(rows[end - 1]) && rows[end - 1].bucket !== RANGE_BUCKET) end -= 1;
  return end === 0 ? rows : rows.slice(0, end);
};

/** "Oct 2026 vs Sep 2026" for the latest-versus-previous tiles; "Selected period" for a whole range. */
export const describeLatestPeriod = (allRows: ReportRow[] | undefined, groupBy: DisplayGroupBy): { label: string; isWholeRange: boolean } => {
  const rows = allRows && withoutEmptyTail(allRows);
  const latest = rows?.[rows.length - 1];
  if (!rows || !latest) return { label: '', isWholeRange: false };
  if (latest.bucket === RANGE_BUCKET) return { label: formatBucket(RANGE_BUCKET, 'none'), isWholeRange: true };
  const previous = rows[rows.length - 2];
  const current = formatBucket(latest.bucket, groupBy);
  return { label: previous ? `${current} vs ${formatBucket(previous.bucket, groupBy)}` : current, isWholeRange: false };
};

// ---------------------------------------------------------------------------------------------
// Trends
// ---------------------------------------------------------------------------------------------

// A trend whose label is the sentinel below is treated by StatCard as "no badge", so it never shows.
export const NO_TREND: Trend = { direction: 'up', label: '—' };

/** The change in a rate between two periods, labelled in percentage points. */
export const rateTrend = (current: number, previous: number): Trend => {
  const delta = Math.round(current) - Math.round(previous);
  return { direction: delta >= 0 ? 'up' : 'down', label: formatPoints(delta) };
};

/**
 * Closed-on-time rate for one ticket bucket: of the closed tickets that have a TAT, the share
 * closed by their deadline. Tickets without a TAT are not in the denominator (closedWithTatCount).
 */
export const slaMetRate = (row?: TatReportRow): number | null => {
  if (!row) return null;
  const denominator = row.closedWithTatCount;
  if (!denominator || denominator <= 0) return null;
  const late = Math.min(row.closedLateCount ?? 0, denominator);
  return Math.round((1 - late / denominator) * 100);
};

// The report rows carry only the bucket label, so the grouping is read back from its shape.
const groupByOfBucket = (bucket: string): DisplayGroupBy | null => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(bucket)) return 'day';
  if (/^\d{4}-W\d{1,2}$/.test(bucket)) return 'week';
  if (/^\d{4}-\d{2}$/.test(bucket)) return 'month';
  if (/^\d{4}$/.test(bucket)) return 'year';
  return null;
};

/** True while the bucket's last day is still ahead of `now`: its total is only part of a period. */
const isBucketOpen = (bucket: string, now: Date): boolean => {
  const unit = groupByOfBucket(bucket);
  const range = unit ? bucketRange(bucket, unit) : null;
  return range != null && new Date(range.to).getTime() > now.getTime();
};

/**
 * The newest bucket's value and how it moved from the bucket before it. A single bucket (the
 * whole-range result) or a missing previous value gives no trend badge at all. A count for a bucket
 * that has not finished yet is not compared with a full previous bucket (that would always read as a
 * drop), so it gets no badge either.
 */
export const latestWithTrend = (
  allRows: ReportRow[] | undefined,
  key: string,
  kind: 'rate' | 'count' = 'count',
  now: Date = new Date(),
): { value: number | null; trend: Trend } => {
  if (!allRows || allRows.length === 0) return { value: null, trend: NO_TREND };
  // A trailing bucket with no runs due (day one of a period) is skipped: the tiles show the last
  // bucket that has numbers, and the one before it for the trend.
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

/** The same, for the closed-on-time rate, which is computed per row rather than read from a field. */
export const slaMetWithTrend = (rows: TatReportRow[] | undefined): { value: number | null; trend: Trend } => {
  const latest = rows?.[rows.length - 1];
  const value = slaMetRate(latest);
  if (value == null || !rows || !latest || latest.bucket === RANGE_BUCKET) return { value, trend: NO_TREND };
  const previous = slaMetRate(rows[rows.length - 2]);
  return { value, trend: previous == null ? NO_TREND : rateTrend(value, previous) };
};

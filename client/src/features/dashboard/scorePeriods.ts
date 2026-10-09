import { bucketKeyFor } from './dashboardDisplay';

// The calendar windows the Scores card and the report exports both offer.
export type ScorePeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';
export const PERIODS: readonly ScorePeriod[] = ['day', 'week', 'month', 'quarter', 'year'];
export const PERIOD_LABEL: Record<ScorePeriod, string> = { day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The calendar window a period tab means, first day to last day (both included), `offset` periods back.
// `todayKey` ('YYYY-MM-DD') is the org's calendar day. Without it the device's own clock decides, which near
// midnight or in another time zone names a different week than the server's.
export const windowFor = (period: ScorePeriod, offset: number, todayKey?: string) => {
  const parts = todayKey?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const now = parts ? new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])) : new Date();
  let start: Date;
  let end: Date;
  if (period === 'day') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    end = start;
  } else if (period === 'week') {
    const monday = now.getDate() - ((now.getDay() + 6) % 7);
    start = new Date(now.getFullYear(), now.getMonth(), monday + offset * 7);
    end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  } else if (period === 'month') {
    start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
  } else if (period === 'quarter') {
    start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 + offset * 3, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
  } else {
    start = new Date(now.getFullYear() + offset, 0, 1);
    end = new Date(start.getFullYear(), 11, 31);
  }
  const quarterNo = Math.floor(start.getMonth() / 3) + 1;
  const label =
    period === 'day' ? (offset === 0 ? 'Today' : offset === -1 ? 'Yesterday' : `${start.getDate()} ${MONTHS[start.getMonth()]} ${start.getFullYear()}`)
    : period === 'week' ? (offset === 0 ? 'This week' : `${start.getDate()} ${MONTHS[start.getMonth()]} to ${end.getDate()} ${MONTHS[end.getMonth()]}`)
    : period === 'month' ? `${MONTHS[start.getMonth()]} ${start.getFullYear()}`
    : period === 'quarter' ? `Q${quarterNo} ${start.getFullYear()}`
    : String(start.getFullYear());
  return { from: bucketKeyFor('day', start), to: bucketKeyFor('day', end), label };
};


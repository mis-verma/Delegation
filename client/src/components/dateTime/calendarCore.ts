
export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const isSameDay = (a: Date | null | undefined, b: Date | null | undefined) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const shiftMonth = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

export const buildMonthGrid = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((startOffset + daysInMonth) / 7);
  return Array.from({ length: rows * 7 }, (_, i) => new Date(year, month, 1 - startOffset + i));
};

export const formatDay = (d: Date) => `${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;

export const formatClock = (d: Date) => {
  const h24 = d.getHours();
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
};

export const fullDayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const withClock = (day: Date, hour: number, minute: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);

export const roundUpToQuarter = (d: Date) => {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), Math.ceil(d.getMinutes() / 15) * 15);
  return next;
};

export const DEFAULT_START_HOUR = 9;
export const DEFAULT_DUE_HOUR = 18;

// Date helpers shared by DatePicker and DateRangePicker. Everything works in the device's local time,
// like the rest of the app's form dates.

export const WEEKDAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const isSameDay = (a: Date | null | undefined, b: Date | null | undefined) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** First day of the month `n` months away. Always lands on the 1st, so Jan 31 + 1 is February, not March. */
export const shiftMonth = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * The weeks of a month as a flat list of dates, Monday first. Only as many rows as the month needs
 * (4 to 6), padded with the neighbouring months' days; the grid blanks those out.
 */
export const buildMonthGrid = (monthDate: Date) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const rows = Math.ceil((startOffset + daysInMonth) / 7);
  return Array.from({ length: rows * 7 }, (_, i) => new Date(year, month, 1 - startOffset + i));
};

/** "Jun 12" (no year, so a trigger chip stays short). */
export const formatDay = (d: Date) => `${MONTH_LABELS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;

/** "6:00 PM". */
export const formatClock = (d: Date) => {
  const h24 = d.getHours();
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${hour12}:${String(d.getMinutes()).padStart(2, '0')} ${h24 >= 12 ? 'PM' : 'AM'}`;
};

/** "HH:mm", the value an `<input type="time">` reads and writes. */
export const toTimeValue = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** "Thursday, 12 June 2026": what a screen reader says for a day cell. */
export const fullDayLabel = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export const withClock = (day: Date, hour: number, minute: number) =>
  new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour, minute);

/** The next quarter hour at or after `d`: 3:47 becomes 4:00, 3:00 stays 3:00. */
export const roundUpToQuarter = (d: Date) => {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), Math.ceil(d.getMinutes() / 15) * 15);
  return next;
};

/** Start of the work day and its end, the defaults a picked day gets when no time was chosen yet. */
export const DEFAULT_START_HOUR = 9;
export const DEFAULT_DUE_HOUR = 18;

// DateRangePicker/DatePicker return plain calendar dates at local midnight when `showTime` isn't
// used — passing that straight to `.toISOString()` as a range's "to" bound silently excludes
// almost the entire last day from any query using it (everything after 00:00:00). Wrap the picked
// end date in this before serializing whenever the range came from a date-only (not date+time) picker.
export const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const relativeDayLabel = (date: Date, now: Date = new Date()) => {
  if (isSameDay(date, now)) return 'Today';

  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (isSameDay(date, tomorrow)) return 'Tomorrow';

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Yesterday';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export const dueLabel = (iso: string | Date) => {
  const d = new Date(iso);
  return `${relativeDayLabel(d)}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

export const addedLabel = (iso: string) => {
  const day = relativeDayLabel(new Date(iso));
  return day === 'Today' || day === 'Yesterday' ? `Added ${day.toLowerCase()}` : `Added ${day}`;
};

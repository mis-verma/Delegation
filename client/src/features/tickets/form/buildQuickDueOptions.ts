const DUE_HOUR = 18;

export const buildQuickDueOptions = () => {
  const now = new Date();
  const at = (addDays: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, DUE_HOUR, 0);
  const options: { label: string; date: Date }[] = [];
  if (at(0).getTime() > now.getTime() + 30 * 60_000) options.push({ label: 'Today', date: at(0) });
  options.push({ label: 'Tomorrow', date: at(1) }, { label: 'In 3 days', date: at(3) }, { label: 'Next week', date: at(7) });
  return options;
};

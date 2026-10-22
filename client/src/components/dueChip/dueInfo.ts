export type DueLevel = 'late' | 'soon' | 'today' | 'tomorrow' | 'later';

export interface DueInfo {
  level: DueLevel;
  label: string;
}

const MINUTE = 60_000;
const HOUR = 3_600_000;

const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const clock = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

const span = (ms: number) => {
  const minutes = Math.max(1, Math.floor(ms / MINUTE));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

export const dueInfo = (at: number, now: number): DueInfo => {
  const diff = at - now;
  if (diff < 0) return { level: 'late', label: `Late ${span(-diff)}` };
  if (diff < 4 * HOUR) return { level: 'soon', label: `Due in ${span(diff)}` };
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  if (days <= 0) return { level: 'today', label: `Today, ${clock(at)}` };
  if (days === 1) return { level: 'tomorrow', label: `Tomorrow, ${clock(at)}` };
  return { level: 'later', label: new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' }) };
};

export type WaitLevel = 'fresh' | 'slow' | 'stuck';

export const waitInfo = (since: number, now: number, warnHours: number, dangerHours: number): { level: WaitLevel; label: string } => {
  const hours = Math.max(0, (now - since) / HOUR);
  const label = hours < 1 ? 'Waiting <1h' : hours < 24 ? `Waiting ${Math.floor(hours)}h` : `Waiting ${Math.floor(hours / 24)}d`;
  const level: WaitLevel = hours >= dangerHours ? 'stuck' : hours >= warnHours ? 'slow' : 'fresh';
  return { level, label };
};

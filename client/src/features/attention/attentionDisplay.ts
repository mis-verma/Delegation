import {
  Check,
  Minus,
  X,
  CalendarX2, CheckCircle2, CircleDashed, ClipboardX, Clock3, Hourglass, Repeat, Send, TicketX, Timer, Undo2, type LucideIcon,
} from 'lucide-react';
import type { AttentionLevel, DayState, PersonAttentionDetail, PersonStatus, RunState } from '../../api/exceptions';
import { GOOD_FROM, FAIR_FROM } from '../../lib/scoreBands';

export type AttentionChip = { key: string; icon: LucideIcon; label: string; tone: string; text?: string };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const LEVEL_LOOK: Record<AttentionLevel, { ring: string; dot: string; text: string; label: string; soft: string }> = {
  red: { ring: 'ring-danger', dot: 'bg-danger', text: 'text-danger', label: 'Needs you now', soft: 'bg-danger/10 dark:bg-danger/15' },
  orange: { ring: 'ring-warning', dot: 'bg-warning', text: 'text-warning', label: 'Falling behind', soft: 'bg-warning/10 dark:bg-warning/15' },
};

export const attentionChips = (p: PersonStatus): AttentionChip[] => {
  const chips: AttentionChip[] = [];
  if (p.missedRuns > 0) chips.push({ key: 'missed', icon: ClipboardX, label: `${plural(p.missedRuns, 'checklist')} not filled`, tone: 'bg-danger', text: 'text-danger' });
  if (p.closingSoon > 0) chips.push({ key: 'soon', icon: Timer, label: p.closingSoon === 1 ? 'Closes within the hour' : `${p.closingSoon} close within the hour`, tone: 'bg-danger', text: 'text-danger' });
  if (p.overdueTickets > 0) chips.push({ key: 'tickets', icon: TicketX, label: `${plural(p.overdueTickets, 'ticket')} overdue`, tone: 'bg-danger', text: 'text-danger' });
  if (p.overdueDelegations > 0) chips.push({ key: 'delegations', icon: CalendarX2, label: `${plural(p.overdueDelegations, 'delegation')} overdue`, tone: 'bg-danger', text: 'text-danger' });
  if (p.notStartedRuns > 0) chips.push({ key: 'notStarted', icon: CircleDashed, label: `${p.notStartedRuns} not started`, tone: 'bg-warning', text: 'text-warning' });
  if (p.toSubmitRuns > 0) chips.push({ key: 'submit', icon: Send, label: `${p.toSubmitRuns} to submit`, tone: 'bg-warning', text: 'text-warning' });
  if (p.sentBackRuns > 0) chips.push({ key: 'sentBack', icon: Undo2, label: `${p.sentBackRuns} sent back`, tone: 'bg-warning', text: 'text-warning' });
  if (p.missedStreak >= 2) chips.push({ key: 'streak', icon: Repeat, label: `Missed ${p.missedStreak} days running`, tone: 'bg-coral-500' });
  return chips;
};

export const RUN_LOOK: Record<RunState, { label: string; icon: LucideIcon; tone: string; text?: string }> = {
  missed: { label: 'Not filled', icon: ClipboardX, tone: 'bg-danger', text: 'text-danger' },
  sent_back: { label: 'Sent back', icon: Undo2, tone: 'bg-warning', text: 'text-warning' },
  not_started: { label: 'Not started', icon: CircleDashed, tone: 'bg-warning', text: 'text-warning' },
  in_progress: { label: 'In progress', icon: Hourglass, tone: 'bg-primary-600 dark:bg-primary-400' },
  to_submit: { label: 'Not submitted', icon: Send, tone: 'bg-warning', text: 'text-warning' },
  upcoming: { label: 'Opens later', icon: Clock3, tone: 'bg-text-muted' },
  submitted: { label: 'Submitted', icon: CheckCircle2, tone: 'bg-success', text: 'text-success' },
};

export const DAY_LOOK: Record<DayState, { cell: string; label: string; glyph: LucideIcon | null }> = {
  done: { cell: 'bg-success text-white', label: 'All filled', glyph: Check },
  partial: { cell: 'bg-warning text-white', label: 'Some not filled', glyph: Minus },
  missed: { cell: 'bg-danger text-white', label: 'Not filled', glyph: X },
  open: { cell: 'bg-primary-500/25 ring-1 ring-inset ring-primary-500/50', label: 'Still open', glyph: null },
  none: { cell: 'bg-border/60', label: 'Nothing due', glyph: null },
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const weekdayOf = (ymd: string) => WEEKDAY[new Date(`${ymd}T00:00:00.000Z`).getUTCDay()];
export const dayMonthOf = (ymd: string) => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  return `${d.getUTCDate()} ${MONTH[d.getUTCMonth()]}`;
};

export const clockOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });

export const deadlineLabel = (iso: string, now: number) => {
  const ms = new Date(iso).getTime();
  if (ms <= now) return `Closed ${clockOf(iso)}`;
  const mins = Math.round((ms - now) / 60_000);
  if (mins < 60) return `Closes in ${mins} min`;
  return `Closes ${clockOf(iso)}`;
};

export const remindedRecently = (iso: string | null, now: number) => !!iso && now - new Date(iso).getTime() < 30 * 60_000;

export const agoLabel = (iso: string, now: number) => {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ago`;
};

export const levelOfDetail = (d: PersonAttentionDetail): AttentionLevel | null => {
  const red = d.runs.some((r) => r.state === 'missed' || r.closingSoon) || d.tickets.some((t) => t.isOverdue) || d.delegations.some((t) => t.overdue);
  if (red) return 'red';
  const orange = d.runs.some((r) => r.state === 'not_started' || r.state === 'to_submit' || r.state === 'sent_back');
  return orange ? 'orange' : null;
};

export const whatsAppLink = (phone: string, text: string) => {
  const digits = phone.replace(/[^0-9]/g, '');
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
};

export const pctText = (v: number | null | undefined) => (v === null || v === undefined ? '–' : `${Math.round(v)}%`);

export const scoreTone = (v: number | null | undefined) =>
  v === null || v === undefined ? 'text-text-muted' : v >= GOOD_FROM ? 'text-success' : v >= FAIR_FROM ? 'text-warning' : 'text-danger';

export const scoreBar = (v: number | null | undefined) =>
  v === null || v === undefined ? 'bg-border' : v >= GOOD_FROM ? 'bg-success' : v >= FAIR_FROM ? 'bg-warning' : 'bg-danger';

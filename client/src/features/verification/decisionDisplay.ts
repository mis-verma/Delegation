import { CheckCircle2, CornerUpLeft, Send } from 'lucide-react';
import type { ChecklistDecision } from './useChecklistDecisions';

export const ACTION_CHIP: Record<ChecklistDecision['action'], { label: string; icon: typeof Send; tone: string }> = {
  APPROVE: { label: 'Approved', icon: CheckCircle2, tone: 'bg-success' },
  REJECT: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SEND_BACK: { label: 'Sent back', icon: CornerUpLeft, tone: 'bg-danger' },
  SUBMIT: { label: 'Submitted', icon: Send, tone: 'bg-primary-600' },
};

export const statusKeyOf = (action: ChecklistDecision['action']) =>
  action === 'APPROVE' ? 'APPROVED' : action === 'SUBMIT' ? 'SUBMITTED' : 'REJECTED';

export const DAY_TIME = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
export const FULL_DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

export const parseAt = (value: string): Date | null => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const initialsOf = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');

export const questionsLabelOf = (count: number) => `${count} ${count === 1 ? 'question' : 'questions'}`;

import React from 'react';
import { CheckCircle2, Clock, CircleDashed, ShieldCheck, FileEdit, ArrowDown, Minus, ArrowUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Task } from '../../api/task';

// `stripe` is the thin rail on a card or tile — a faint accent beside content, deliberately quiet.
// `bar` is the same priority at full strength, for a shape that IS the data rather than an accent
// on it: the Gantt bars, where a 35%-opacity fill on a light background reads as "disabled" and
// the three priorities become almost indistinguishable from each other and from the empty track.
// Low is blue rather than grey — grey on a chart looks like missing data, not low priority.
// `solid`/`icon` feed PriorityChip's icon circle (see IconChip) — a full-strength color, not
// `accent`'s translucent tint, since a white icon needs real contrast to read against it.
export const PRIORITY_MAP = {
  low: {
    label: 'Low',
    className: 'bg-surface-hover text-text-muted transition-colors duration-200',
    accent: 'bg-text-light',
    stripe: 'bg-text-light/40',
    bar: 'bg-info',
    solid: 'bg-text-light',
    icon: ArrowDown,
  },
  medium: {
    label: 'Medium',
    className: 'bg-warning/10 text-warning transition-colors duration-200',
    accent: 'bg-warning/35',
    stripe: 'bg-warning/35',
    bar: 'bg-warning',
    solid: 'bg-warning',
    icon: Minus,
  },
  high: {
    label: 'High',
    className: 'bg-danger/10 text-danger transition-colors duration-200',
    accent: 'bg-danger/35',
    stripe: 'bg-danger/35',
    bar: 'bg-danger',
    solid: 'bg-danger',
    icon: ArrowUp,
  },
} satisfies Record<Task['priority'], { label: string; className: string; accent: string; stripe: string; bar: string; solid: string; icon: LucideIcon }>;


export const STATUS_ICON = {
  draft: <FileEdit size={16} className="text-text-muted shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
  todo: <CircleDashed size={16} className="text-status-todo shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
  in_progress: <Clock size={16} className="text-status-progress shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
  pending_approval: <ShieldCheck size={16} className="text-status-approve shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
  done: <CheckCircle2 size={16} className="text-status-done shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
} satisfies Record<Task['status'], React.ReactNode>;


// The statuses a "Move to" menu offers, in board order. Lives here rather than in TaskCard now
// that the card, the table view and the timeline view all render the same menu — three private
// copies of this array is exactly how the modules' stat tiles drifted apart before. Deliberately
// stops at pending_approval: done is reachable only through the single-stage verify() decision,
// never a raw "move to" pick.
export const MOVABLE_STATUSES: Task['status'][] = ['todo', 'in_progress', 'pending_approval', 'done'];


export const STATUS_LABEL = {
  draft: 'Draft',
  todo: 'To Do',
  in_progress: 'In Progress',
  pending_approval: 'Pending Approval',
  done: 'Done',
} satisfies Record<Task['status'], string>;


export const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    badge: 'bg-surface-hover text-text-muted border-border/60 transition-all duration-200 ease-in-out',
    indicator: 'bg-text-light/35 transition-colors duration-200',
  },
  todo: {
    label: 'To Do',
    badge: 'bg-status-todo/10 text-status-todo border-status-todo/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-todo/35 transition-colors duration-200',
  },
  in_progress: {
    label: 'In Progress',
    badge: 'bg-status-progress/10 text-status-progress border-status-progress/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-progress/35 transition-colors duration-200',
  },
  pending_approval: {
    label: 'Pending Approval',
    badge: 'bg-status-approve/10 text-status-approve border-status-approve/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-approve/35 transition-colors duration-200',
  },
  done: {
    label: 'Done',
    badge: 'bg-status-done/10 text-status-done border-status-done/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-done/35 transition-colors duration-200',
  },
} satisfies Record<
  Task['status'],
  { label: string; badge: string; indicator: string }
>;


// Per-task completion weight for scoring/reporting: Done counts fully, In Progress/Pending
// Approval count as half-credit (whether or not its due date has already passed — being actively
// worked still counts for something), and anything not yet started (todo) counts as zero,
// overdue or not. Only an explicit "done" status is full credit.
export const TASK_SCORE: Record<Task['status'], number> = {
  draft: 0,
  todo: 0,
  // Weighted by how far along the work is: started is a quarter, handed in for approval is three
  // quarters, only approved-and-done is the full mark. (Both used to be 50, so submitting for approval
  // earned nothing over merely starting.)
  in_progress: 0.25,
  pending_approval: 0.75,
  done: 1,
};

export const taskScorePercent = (status: Task['status']) => Math.round(TASK_SCORE[status] * 100);

export const NEXT_STATUS: Record<Task['status'], Task['status'] | null> = {
  // "Advance to To Do" is this delegation's Publish action — same mechanism (and same remark
  // prompt) as any other status move, not a special case.
  draft: 'todo',
  todo: 'in_progress',
  in_progress: 'pending_approval',
  // pending_approval -> done happens only through TaskVerifyActions (the single-stage verify()
  // decision), never this raw "advance" button.
  pending_approval: null,
  done: null,
};

// Self-service "undo" — deliberately only in_progress -> todo. Reverting out of pending_approval
// or done has to go through TaskVerifyActions (REJECT), not a raw status edit, since that path
// also records a verification note and notifies the assignee.
export const PREV_STATUS: Record<Task['status'], Task['status'] | null> = {
  draft: null,
  todo: null,
  in_progress: 'todo',
  pending_approval: null,
  done: null,
};
import React from 'react';
import { CheckCircle2, Clock, CircleDashed, ShieldQuestion } from 'lucide-react';
import type { Task } from '../../api/task';

// `stripe` is the thin rail on a card or tile — a faint accent beside content, deliberately quiet.
// `bar` is the same priority at full strength, for a shape that IS the data rather than an accent
// on it: the Gantt bars, where a 35%-opacity fill on a light background reads as "disabled" and
// the three priorities become almost indistinguishable from each other and from the empty track.
// Low is blue rather than grey — grey on a chart looks like missing data, not low priority.
export const PRIORITY_MAP = {
  low: {
    label: 'Low',
    className: 'bg-surface-hover text-text-muted transition-colors duration-200',
    accent: 'bg-text-light',
    stripe: 'bg-text-light/40',
    bar: 'bg-info',
  },
  medium: {
    label: 'Medium',
    className: 'bg-warning/10 text-warning transition-colors duration-200',
    accent: 'bg-warning/35',
    stripe: 'bg-warning/35',
    bar: 'bg-warning',
  },
  high: {
    label: 'High',
    className: 'bg-danger/10 text-danger transition-colors duration-200',
    accent: 'bg-danger/35',
    stripe: 'bg-danger/35',
    bar: 'bg-danger',
  },
} satisfies Record<Task['priority'], { label: string; className: string; accent: string; stripe: string; bar: string }>;


export const STATUS_ICON = {
  todo: <CircleDashed size={16} className="text-status-todo shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
  in_progress: <Clock size={16} className="text-status-progress shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
  pending_verification: <ShieldQuestion size={16} className="text-status-verify shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
  done: <CheckCircle2 size={16} className="text-status-done shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
} satisfies Record<Task['status'], React.ReactNode>;


// The statuses a "Move to" menu offers, in board order. Lives here rather than in TaskCard now
// that the card, the table view and the timeline view all render the same menu — three private
// copies of this array is exactly how the modules' stat tiles drifted apart before.
export const MOVABLE_STATUSES: Task['status'][] = ['todo', 'in_progress', 'pending_verification', 'done'];


export const STATUS_LABEL = {
  todo: 'To Do',
  in_progress: 'In Progress',
  pending_verification: 'Pending Verification',
  done: 'Done',
} satisfies Record<Task['status'], string>;


export const STATUS_CONFIG = {
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
  pending_verification: {
    label: 'Pending Verification',
    badge: 'bg-status-verify/10 text-status-verify border-status-verify/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-verify/35 transition-colors duration-200',
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


// Per-task completion weight for scoring/reporting: Done counts fully, In Progress counts as
// half-credit (whether or not its due date has already passed — being actively worked still
// counts for something), and anything not yet started (todo) counts as zero, overdue or not.
// pending_verification is grouped with in_progress since the work itself isn't verified/closed
// out yet — only an explicit "done" status is full credit.
export const TASK_SCORE: Record<Task['status'], number> = {
  todo: 0,
  in_progress: 0.5,
  pending_verification: 0.5,
  done: 1,
};

export const taskScorePercent = (status: Task['status']) => Math.round(TASK_SCORE[status] * 100);

export const NEXT_STATUS: Record<Task['status'], Task['status'] | null> = {
  todo: 'in_progress',
  in_progress: 'pending_verification',
  pending_verification: null,
  done: null,
};

// Self-service "undo" — deliberately only in_progress -> todo. Reverting out of
// pending_verification or done has to go through TaskVerifyActions (REJECT), not a raw status
// edit, since that path also records a verification note and notifies the assignee.
export const PREV_STATUS: Record<Task['status'], Task['status'] | null> = {
  todo: null,
  in_progress: 'todo',
  pending_verification: null,
  done: null,
};
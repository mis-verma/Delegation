import React from 'react';
import { CheckCircle2, Clock, CircleDashed, ShieldCheck, FileEdit, PauseCircle, ArrowDown, Minus, ArrowUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Task } from '../../api/task';

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
  on_hold: <PauseCircle size={16} className="text-warning shrink-0 transition-colors duration-200" strokeWidth={2.5} />,
} satisfies Record<Task['status'], React.ReactNode>;


export const MOVABLE_STATUSES: Task['status'][] = ['todo', 'in_progress', 'on_hold', 'pending_approval', 'done'];


// The one set of status names Delegation uses everywhere, for every role: chips, filters, the
// detail footer and stepper, toasts and history. Change a word here, not at a call site.
export const STATUS_LABEL = {
  draft: 'Draft',
  todo: 'To do',
  in_progress: 'In progress',
  pending_approval: 'Waiting for approval',
  done: 'Done',
  on_hold: 'On hold',
} satisfies Record<Task['status'], string>;


export const STATUS_CONFIG = {
  draft: {
    label: 'Draft',
    badge: 'bg-surface-hover text-text-muted border-border/60 transition-all duration-200 ease-in-out',
    indicator: 'bg-text-light/35 transition-colors duration-200',
  },
  todo: {
    label: STATUS_LABEL.todo,
    badge: 'bg-status-todo/10 text-status-todo border-status-todo/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-todo/35 transition-colors duration-200',
  },
  in_progress: {
    label: STATUS_LABEL.in_progress,
    badge: 'bg-status-progress/10 text-status-progress border-status-progress/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-progress/35 transition-colors duration-200',
  },
  pending_approval: {
    label: STATUS_LABEL.pending_approval,
    badge: 'bg-status-approve/10 text-status-approve border-status-approve/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-approve/35 transition-colors duration-200',
  },
  done: {
    label: 'Done',
    badge: 'bg-status-done/10 text-status-done border-status-done/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-status-done/35 transition-colors duration-200',
  },
  on_hold: {
    label: STATUS_LABEL.on_hold,
    badge: 'bg-warning/10 text-warning border-warning/20 transition-all duration-200 ease-in-out',
    indicator: 'bg-warning/35 transition-colors duration-200',
  },
} satisfies Record<
  Task['status'],
  { label: string; badge: string; indicator: string }
>;


export const TASK_SCORE: Record<Task['status'], number> = {
  draft: 0,
  todo: 0,
  
  in_progress: 0.25,
  pending_approval: 0.75,
  done: 1,
  on_hold: 0,
};

export const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);

export const taskScorePercent = (status: Task['status']) => Math.round(TASK_SCORE[status] * 100);

export const NEXT_STATUS: Record<Task['status'], Task['status'] | null> = {

  draft: 'todo',
  todo: 'in_progress',
  in_progress: 'pending_approval',
  pending_approval: null,
  done: null,
  on_hold: 'in_progress',
};


export const PREV_STATUS: Record<Task['status'], Task['status'] | null> = {
  draft: null,
  todo: null,
  in_progress: 'todo',
  pending_approval: null,
  done: null,
  on_hold: null,
};
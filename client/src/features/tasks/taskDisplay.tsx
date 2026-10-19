import React from 'react';
import { CheckCircle2, Clock, CircleDashed, ShieldCheck, FileEdit, PauseCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Task } from '../../api/task';
import { PRIORITY_CHIP_META } from '../../components/priorityChip';

export const PRIORITY_MAP = {
  low: {
    ...PRIORITY_CHIP_META.low,
    className: 'bg-surface-hover text-text-muted transition-colors duration-200',
    accent: 'bg-text-light',
    stripe: 'bg-text-light/40',
    bar: 'bg-info',
  },
  medium: {
    ...PRIORITY_CHIP_META.medium,
    className: 'bg-warning/10 text-warning transition-colors duration-200',
    accent: 'bg-warning/35',
    stripe: 'bg-warning/35',
    bar: 'bg-warning',
  },
  high: {
    ...PRIORITY_CHIP_META.high,
    className: 'bg-danger/10 text-danger transition-colors duration-200',
    accent: 'bg-danger/35',
    stripe: 'bg-danger/35',
    bar: 'bg-danger',
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

export const STATUS_LABEL = {
  draft: 'Draft',
  todo: 'To do',
  in_progress: 'In progress',
  pending_approval: 'Waiting for approval',
  done: 'Done',
  on_hold: 'On hold',
} satisfies Record<Task['status'], string>;

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
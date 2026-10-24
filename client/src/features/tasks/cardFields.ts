import { useEffect, useState } from 'react';
import {
  SquareStack,
  Users,
  CalendarClock,
  ListChecks,
  Flag,
  Tag,
  Bug,
  UserCheck,
  UserCog,
  Building2,
  CalendarPlus,
  History,
  type LucideIcon,
} from 'lucide-react';
import type { Task } from '../../api/task';

export type CardFieldKey =
  | 'status'
  | 'raisedBy'
  | 'assignee'
  | 'dueDate'
  | 'subtasks'
  | 'priority'
  | 'category'
  | 'department'
  | 'created'
  | 'updated';

export const CARD_FIELD_CONFIG: { key: CardFieldKey; label: string; icon: LucideIcon }[] = [
  { key: 'status', label: 'Status', icon: SquareStack },
  { key: 'raisedBy', label: 'Raised by', icon: UserCog },
  { key: 'assignee', label: 'Assignee', icon: Users },
  { key: 'dueDate', label: 'Due date', icon: CalendarClock },
  { key: 'subtasks', label: 'Subtasks', icon: ListChecks },
  { key: 'priority', label: 'Priority', icon: Flag },
  { key: 'category', label: 'Category', icon: Tag },
  { key: 'department', label: 'Department', icon: Building2 },
  { key: 'created', label: 'Created', icon: CalendarPlus },
  { key: 'updated', label: 'Updated', icon: History },
];

export type CardFieldVisibility = Record<CardFieldKey, boolean>;

const DEFAULT_VISIBILITY: CardFieldVisibility = {
  status: true,
  raisedBy: true,
  assignee: true,
  dueDate: true,
  subtasks: true,
  priority: true,
  category: false,
  department: true,
  created: false,
  updated: false,
};

const STORAGE_KEY = 'taskmatrix:card-fields';

export const useCardFieldVisibility = () => {
  const [visibility, setVisibility] = useState<CardFieldVisibility>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULT_VISIBILITY, ...JSON.parse(raw) } : DEFAULT_VISIBILITY;
    } catch {
      return DEFAULT_VISIBILITY;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
    } catch {
    }
  }, [visibility]);

  const toggle = (key: CardFieldKey) => setVisibility(v => ({ ...v, [key]: !v[key] }));
  
  return { visibility, toggle };
};

export const CATEGORY_CONFIG: Record<Task['category'], { label: string; icon: LucideIcon; solid: string }> = {
  issue: { label: 'Issue', icon: Bug, solid: 'bg-danger' },
  delegation: { label: 'Delegation', icon: UserCheck, solid: 'bg-info' },
};

export const subtaskProgress = (task: { checklists?: { items: { isDone: boolean }[] }[]; checklistSummary?: { total: number; done: number } }) => {
  if (!task.checklists?.length && task.checklistSummary) return task.checklistSummary.total > 0 ? { done: task.checklistSummary.done, total: task.checklistSummary.total } : null;
  const items = (task.checklists ?? []).flatMap(c => c.items);
  if (items.length === 0) return null;
  return { done: items.filter(i => i.isDone).length, total: items.length };
};

export const formatShortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const formatShortDateTime = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

export const taskAssigneeIds = (task: Pick<Task, 'assigneeId' | 'additionalAssigneeIds'>): string[] =>
  [task.assigneeId, ...(task.additionalAssigneeIds ?? [])].filter((id): id is string => !!id);
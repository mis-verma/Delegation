import type { ComponentType } from 'react';
import type { ViewTab } from '../../components';
import { TodoListBody } from './TodoRow';
import { TodoCardsBody } from './TodoCard';
import { TodoTableBody } from './TodoTable';
import type { TodoBodyProps } from './todoActions';

export type TodoViewKey = 'cards' | 'list' | 'table';

export const DEFAULT_TODO_VIEW: TodoViewKey = 'list';

export const TODO_VIEW_TABS: ViewTab<TodoViewKey>[] = [
  { key: 'cards', label: 'Cards' },
  { key: 'list', label: 'List' },
  { key: 'table', label: 'Table', mobileHidden: true },
];

export const TODO_VIEW_KEYS = TODO_VIEW_TABS.map((t) => t.key);

export const TODO_VIEW_BODY: Record<TodoViewKey, ComponentType<TodoBodyProps>> = {
  cards: TodoCardsBody,
  list: TodoListBody,
  table: TodoTableBody,
};

export const TODO_VIEW_GROUPED: Record<TodoViewKey, boolean> = {
  cards: true,
  list: true,
  table: false,
};

export const TODO_VIEW_SPLIT: Record<TodoViewKey, boolean> = {
  cards: false,
  list: true,
  table: false,
};

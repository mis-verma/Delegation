import type { Todo } from '../../api/todos';

export interface TodoActions {
  onToggle: (todo: Todo) => void;
  onComplete: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todo: Todo) => void;
  onSetDue: (todo: Todo, date: Date | null) => void;
}

export interface TodoBodyProps {
  todos: readonly Todo[];
  actions: TodoActions;
}

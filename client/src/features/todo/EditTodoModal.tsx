import { TodoFormModal } from './TodoFormModal';
import type { Todo } from '../../api/todos';

interface EditTodoModalProps {
  todo: Todo;
  onClose: () => void;
}

/** Edit an existing to-do, opened from a row's menu or by tapping the row. */
export const EditTodoModal = ({ todo, onClose }: EditTodoModalProps) => <TodoFormModal todo={todo} onClose={onClose} />;

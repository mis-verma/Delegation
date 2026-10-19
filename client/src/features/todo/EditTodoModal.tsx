import { TodoFormModal } from './TodoFormModal';
import type { Todo } from '../../api/todos';

interface EditTodoModalProps {
  todo: Todo;
  onClose: () => void;
}

export const EditTodoModal = ({ todo, onClose }: EditTodoModalProps) => <TodoFormModal todo={todo} onClose={onClose} />;

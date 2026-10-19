import { TodoFormModal } from './TodoFormModal';

interface CreateTodoModalProps {
  open: boolean;
  onClose: () => void;
}

export const CreateTodoModal = ({ open, onClose }: CreateTodoModalProps) =>
  open ? <TodoFormModal onClose={onClose} /> : null;

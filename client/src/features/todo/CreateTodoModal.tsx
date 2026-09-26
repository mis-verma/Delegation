import { TodoFormModal } from './TodoFormModal';

interface CreateTodoModalProps {
  open: boolean;
  onClose: () => void;
}

/** "Add to-do" entry point for the page, the FAB and the sidebar's quick-create link. Mounting
 *  only while open resets the form every time it opens. */
export const CreateTodoModal = ({ open, onClose }: CreateTodoModalProps) =>
  open ? <TodoFormModal onClose={onClose} /> : null;

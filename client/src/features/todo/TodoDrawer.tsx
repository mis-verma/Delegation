import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { X, ListTodo, Plus } from 'lucide-react';
import { GradientIconTile, Input, Loader } from '../../components';
import { TodoList } from './TodoList';
import { useCreateTodoMutation } from './hook';

interface TodoDrawerProps {
  open: boolean;
  onClose: () => void;
}


export const TodoDrawer = ({ open, onClose }: TodoDrawerProps) => {
  const [quickText, setQuickText] = useState('');
  const createMut = useCreateTodoMutation();

  // Only entry point for adding a todo from the drawer — the floating + (full Create modal) was
  // removed as redundant once this covered the instant-add case.
  const handleQuickAdd = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = quickText.trim();
    if (!trimmed) return;
    createMut.mutate({ text: trimmed }, { onSuccess: () => setQuickText('') });
  };

  return createPortal(
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-200"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Your to-do list"
        aria-hidden={!open}
        // `inert` alongside aria-hidden: aria-hidden on a container whose children are still
        // focusable is an a11y violation — Tab could land inside the closed drawer. inert removes
        // the whole subtree from the tab order and from hit-testing in one go.
        inert={!open}
        className={`fixed top-0 bottom-0 right-0 z-[60] w-full sm:w-96 max-w-[90vw] bg-surface border-l border-border flex flex-col transition-transform duration-300 ease-in-out motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <GradientIconTile icon={ListTodo} size="sm" />
            <div className="min-w-0">
              <h2 className="t-card font-display font-semibold text-text tracking-tight truncate">Your to-do list</h2>
              <p className="text-xs text-text-muted truncate">Personal tasks, just for you</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            // Was `focus:ring-surface-hover` — a near-invisible ring against the surface it sits
            // on. Uses the same primary focus treatment as every other control in this feature.
            className="shrink-0 flex items-center justify-center size-9 rounded-full text-text-light hover:text-text hover:bg-surface-hover transition-all duration-200 ease-in-out cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={handleQuickAdd} className="px-5 py-3 border-b border-border shrink-0">
          <Input
            value={quickText}
            onChange={(e) => setQuickText(e.target.value)}
            placeholder="Quick add a task…"
            maxLength={200}
            aria-label="Quick add a task"
            suffix={
              <button
                type="submit"
                disabled={!quickText.trim() || createMut.isPending}
                aria-label="Add task"
                className="flex items-center justify-center size-7 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 ease-in-out cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                {createMut.isPending ? <Loader size="sm" variant="white" className="w-3.5 h-3.5" /> : <Plus size={14} strokeWidth={2.5} />}
              </button>
            }
          />
        </form>

        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
          <TodoList />
        </div>
      </aside>
    </>,
    document.body,
  );
};

import { PriorityChip, StatusBadge } from '../../components';
import { TABLE_FRAME_CLASS, TH_CLASS, TD_CLASS, TR_CLASS, activateOnKey } from '../../components/dataTable';
import { cn } from '@/lib/utils';
import { PRIORITY_MAP } from '../tasks/taskDisplay';
import { addedLabel, dueLabel } from './todoDate';
import { TODO_STATUS_META, todoStatusOf } from './todoStatus';
import { TodoCheck, TodoRowActions } from './TodoParts';
import type { TodoBodyProps } from './todoActions';

export const TodoTableBody = ({ todos, actions }: TodoBodyProps) => (
  <div className={TABLE_FRAME_CLASS}>
    <table className="w-full min-w-[46rem] border-collapse">
      <caption className="sr-only">To-dos</caption>
      <thead>
        <tr>
          <th scope="col" className={cn(TH_CLASS, 'w-14')}><span className="sr-only">Done</span></th>
          <th scope="col" className={TH_CLASS}>To-do</th>
          <th scope="col" className={TH_CLASS}>Priority</th>
          <th scope="col" className={TH_CLASS}>Status</th>
          <th scope="col" className={TH_CLASS}>Due</th>
          <th scope="col" className={TH_CLASS}>Added</th>
          <th scope="col" className={TH_CLASS}><span className="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        {todos.map((todo) => {
          const meta = TODO_STATUS_META[todoStatusOf(todo)];
          return (
            <tr key={todo.id} tabIndex={0} onClick={() => actions.onEdit(todo)} onKeyDown={activateOnKey(() => actions.onEdit(todo))} className={TR_CLASS}>
              <td className={cn(TD_CLASS, 'py-0')} onClick={(e) => e.stopPropagation()}>
                <TodoCheck todo={todo} onToggle={actions.onToggle} />
              </td>
              <td className={cn(TD_CLASS, 'min-w-56 max-w-md')}>
                <span
                  title={todo.text}
                  className={cn('block break-words line-clamp-2 t-card font-display leading-snug', todo.completed ? 'font-medium text-text-muted line-through decoration-text-muted/60' : 'font-semibold text-text')}
                >
                  {todo.text}
                </span>
              </td>
              <td className={TD_CLASS}><PriorityChip meta={PRIORITY_MAP[todo.priority]} /></td>
              <td className={TD_CLASS}><StatusBadge variant={meta.variant} icon={meta.icon} label={meta.label} /></td>
              <td className={cn(TD_CLASS, 'whitespace-nowrap tabular-nums')}>{todo.dueDate ? dueLabel(todo.dueDate) : <span className="text-text-muted">No due date</span>}</td>
              <td className={cn(TD_CLASS, 'whitespace-nowrap')} title={new Date(todo.createdAt).toLocaleString()}>{addedLabel(todo.createdAt)}</td>
              <td className={TD_CLASS} onClick={(e) => e.stopPropagation()}>
                <TodoRowActions todo={todo} actions={actions} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

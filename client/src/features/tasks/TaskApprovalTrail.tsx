import { ApprovalTrail } from '../../components/approvalTrail/ApprovalTrail';
import { stageOf } from '../../lib/ticketApproval';
import type { Task } from '../../api/task';

export const TaskApprovalTrail = ({ task }: { task: Task }) => (
  <ApprovalTrail
    pending={task.status === 'pending_approval'}
    closed={task.status === 'done' && !!task.verifiedAt}
    stage={stageOf(task)}
    submittedAt={task.submittedAt}
    hodApprovedAt={task.hodApprovedAt}
    finalAt={task.verifiedAt}
  />
);

import { ApprovalTrail } from '../../components/approvalTrail/ApprovalTrail';
import { stageOf } from '../../lib/ticketApproval';
import type { Task } from '../../api/task';

const name = (p: { firstName: string; lastName: string | null } | null | undefined) => (p ? `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}` : null);

export const TaskApprovalTrail = ({ task }: { task: Task }) => (
  <ApprovalTrail
    pending={task.status === 'pending_approval'}
    closed={task.status === 'done' && !!task.verifiedAt}
    stage={stageOf(task)}
    submittedAt={task.submittedAt}
    hodApprovedAt={task.hodApprovedAt}
    hodName={name(task.hodApprover)}
    finalAt={task.verifiedAt}
    finalName={name(task.verifier)}
  />
);

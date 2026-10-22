import { BellRing, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { IconChip } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { taskFlowState } from './taskFlow';
import type { Task } from '../../api/task';

export const TaskFlowChips = ({ task }: { task: Task }) => {
  const { user } = useAuth();
  const { awaiting, needsMyDecision, headApproved } = taskFlowState(task, user);

  return (
    <>
      {awaiting && (needsMyDecision ? (
        <IconChip icon={BellRing} tone="bg-linear-to-br from-warning to-warning/70" label="Needs your decision" className="border-warning/40 bg-warning/15" labelClassName="text-warning" />
      ) : (
        <IconChip icon={ShieldQuestion} tone="bg-warning" label="Head approval" className="border-warning/30 bg-warning/10" labelClassName="text-warning" />
      ))}
      {headApproved && (
        <IconChip
          icon={ShieldCheck}
          tone="bg-success"
          label="Head approved"
          title={`Approved by ${task.assignmentApprover?.firstName ?? 'the department head'}`}
          className="border-success/30 bg-success/10"
          labelClassName="text-success"
        />
      )}
    </>
  );
};

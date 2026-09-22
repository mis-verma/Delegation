import { CircleDashed, Clock, CheckCircle2 } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import { TASK_SCORE, taskScorePercent } from './taskDisplay';
import type { Task } from '../../api/task';

// Done gets the success tint; anything still in progress uses the app's single navy-blue accent
// (not a warning/yellow tier) rather than reading as an alert.
const scoreTone = (status: Task['status']) => {
  const score = TASK_SCORE[status];
  if (score >= 1) return { tone: 'bg-success', icon: CheckCircle2 };
  if (score > 0) return { tone: 'bg-primary-600', icon: Clock };
  return { tone: 'bg-text-muted', icon: CircleDashed };
};

interface TaskScoreBadgeProps {
  status: Task['status'];
}

export const TaskScoreBadge = ({ status }: TaskScoreBadgeProps) => {
  const { tone, icon } = scoreTone(status);
  return <IconChip icon={icon} tone={tone} label={`Mark ${taskScorePercent(status)}%`} />;
};

import { memo } from 'react';
import { useNavigate } from 'react-router';
import { CheckCircle2, Send } from 'lucide-react';
import { Button, PANEL_CLASS } from '../../../components';
import { cn } from '@/lib/utils';
import { useSubmitChecklistInstanceMutation } from '../hook';

interface ChecklistSubmitBarProps {
  instanceId: string;
  total: number;
  resubmit: boolean;
}

export const ChecklistSubmitBar = memo(function ChecklistSubmitBar({ instanceId, total, resubmit }: ChecklistSubmitBarProps) {
  const submit = useSubmitChecklistInstanceMutation();
  const navigate = useNavigate();
  return (
    <div className={cn(PANEL_CLASS, 'sticky bottom-3 z-20 flex flex-col sm:flex-row sm:items-center gap-3 p-3.5 sm:p-4 border-success/30 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85')}>
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="flex items-center justify-center size-10 rounded-xl bg-success/10 text-success shrink-0" aria-hidden>
          <CheckCircle2 size={20} />
        </span>
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm font-display font-semibold text-text">
            {resubmit ? 'Everything flagged is fixed' : `All ${total} ${total === 1 ? 'question is' : 'questions are'} done`}
          </p>
          <p className="t-meta font-display text-text-muted">
            {resubmit ? 'Send it back for another look.' : 'Submit it so your reviewer can check it.'}
          </p>
        </div>
      </div>
      <Button variant="primary" size="lg" className="gap-2 w-full sm:w-auto bg-success hover:bg-success/90 text-white" isLoading={submit.isPending} onClick={() => submit.mutate(instanceId, { onSuccess: () => navigate('/checklists') })}>
        <Send size={16} aria-hidden />
        {resubmit ? 'Submit again' : 'Submit for approval'}
      </Button>
    </div>
  );
});

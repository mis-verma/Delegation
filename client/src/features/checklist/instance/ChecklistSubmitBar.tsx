import { memo } from 'react';
import { Send } from 'lucide-react';
import { Button, InlineError } from '../../../components';
import { cn } from '@/lib/utils';
import type { SubmitRun } from './fill/useSubmitRun';

interface ChecklistSubmitButtonProps {
  submit: SubmitRun;
  resubmit: boolean;
  className?: string;
}

export const ChecklistSubmitError = ({ submit }: { submit: SubmitRun }) =>
  submit.failed ? <InlineError message={`Not submitted. ${submit.errorText} Your answers are saved.`} onRetry={submit.send} /> : null;

export const ChecklistSubmitButton = memo(function ChecklistSubmitButton({ submit, resubmit, className }: ChecklistSubmitButtonProps) {
  if (submit.failed) return null;
  return (
    <Button
      variant="primary"
      size="md"
      className={cn('gap-2 h-11 bg-success hover:bg-success/90 text-white font-display', className)}
      isLoading={submit.pending}
      onClick={submit.send}
    >
      <Send size={16} aria-hidden />
      {resubmit ? 'Submit again' : 'Submit for approval'}
    </Button>
  );
});

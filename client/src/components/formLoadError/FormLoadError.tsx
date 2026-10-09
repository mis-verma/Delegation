import { AlertCircle } from 'lucide-react';
import { Modal } from '../modal';
import { Button } from '../button';

interface FormLoadErrorProps {
  onClose: () => void;
}

export const FormLoadError = ({ onClose }: FormLoadErrorProps) => (
  <Modal
    open
    onClose={onClose}
    icon={<AlertCircle className="size-5" strokeWidth={2.5} />}
    iconTone="danger"
    title={<span className="text-xl font-bold text-text tracking-tight">Couldn't load this form</span>}
    description={<span className="text-sm font-medium text-text-muted">Check your connection and try again.</span>}
    footer={
      <div className="flex w-full justify-end pt-2">
        <Button 
          variant="primary" 
          size="sm" 
          onClick={onClose}
          className="w-full sm:w-auto px-6 py-2.5 rounded-xl font-bold text-sm shadow-md shadow-text/10 active:scale-95 transition-all duration-200"
        >
          Close
        </Button>
      </div>
    }
  >
    <div className="p-4 mt-2 rounded-2xl bg-surface-hover border border-border shadow-inner shadow-border/50 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <p className="text-sm leading-relaxed text-text-secondary font-medium">
        This usually clears up on a retry — close this and reopen the form.
      </p>
    </div>
  </Modal>
);
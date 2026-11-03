import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button, Combobox, Modal } from '../../../components';

interface RedirectTicketDialogProps {
  open: boolean;
  ticketTitle: string;
  currentDepartmentId: string | null;
  departments: { id: string; name: string }[];
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (departmentId: string) => void;
}

export const RedirectTicketDialog = ({ open, ticketTitle, currentDepartmentId, departments, isPending, onCancel, onConfirm }: RedirectTicketDialogProps) => {
  const [departmentId, setDepartmentId] = useState('');
  const options = departments.filter((d) => d.id !== currentDepartmentId).map((d) => ({ value: d.id, label: d.name }));
  const close = () => {
    if (isPending) return;
    setDepartmentId('');
    onCancel();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      icon={<Building2 className="size-5" />}
      title="Send to another team"
      description="Wrong team? Pick the right one. Their head decides next, and the person who sent it is told."
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button variant="ghost" onClick={close} disabled={isPending}>Cancel</Button>
          <Button variant="primary" onClick={() => onConfirm(departmentId)} isLoading={isPending} disabled={!departmentId}>Send it</Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="rounded-lg border border-border/60 bg-surface-hover/50 px-3 py-2 t-card font-display font-semibold text-text line-clamp-2 break-words">{ticketTitle}</p>
        <label className="t-meta font-display font-semibold text-text-secondary">Which team should handle it?</label>
        <Combobox
          value={departmentId}
          onChange={setDepartmentId}
          options={options}
          placeholder="Search teams..."
          emptyOptionLabel="Choose a team"
          className="w-full"
        />
      </div>
    </Modal>
  );
};

import { useState } from 'react';
import { CornerUpLeft } from 'lucide-react';
import { Modal } from '../../components';
import { SendBackForm } from '../checklist/instance/ReviewActions';
import { SEND_BACK_NOTE_MAX } from '../checklist/instance/sendBackNote';

interface SendBackDialogProps {
  title: string | null;
  onClose: () => void;
  onSubmit: (note: string) => void;
}

const SendBackBody = ({ onClose, onSubmit }: Pick<SendBackDialogProps, 'onClose' | 'onSubmit'>) => {
  const [note, setNote] = useState('');
  const trimmed = note.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= SEND_BACK_NOTE_MAX;

  return (
    <div className="flex flex-col gap-3">
      <SendBackForm
        autoFocus
        quickReasons
        note={note}
        onNoteChange={setNote}
        onCancel={onClose}
        onSubmit={() => { if (canSubmit) onSubmit(trimmed); }}
        canSubmit={canSubmit}
        isSending={false}
        busy={false}
        submitLabel="Send back"
        placeholder="What needs fixing before this can be approved?"
        maxLength={SEND_BACK_NOTE_MAX}
      />
    </div>
  );
};

export const SendBackDialog = ({ title, onClose, onSubmit }: SendBackDialogProps) => (
  <Modal
    open={title !== null}
    onClose={onClose}
    size="md"
    icon={<CornerUpLeft size={20} strokeWidth={2.25} aria-hidden="true" />}
    iconTone="danger"
    title="Send back for changes"
    description={title ?? undefined}
  >
    <SendBackBody onClose={onClose} onSubmit={onSubmit} />
  </Modal>
);

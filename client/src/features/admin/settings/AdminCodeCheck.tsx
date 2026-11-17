import { useState } from 'react';
import { KeyRound, MailCheck } from 'lucide-react';
import { Button, Input, Modal } from '../../../components';
import { notifyError } from '../../../lib/queryHelpers';
import { settingApi } from '../../../api/settings';

const CODE_LENGTH = 6;

interface AdminCodeCheckProps {
  open: boolean;
  onCancel: () => void;
  onVerified: (code: string) => void;
}

export const AdminCodeCheck = ({ open, onCancel, onVerified }: AdminCodeCheckProps) => {
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);

  const close = () => {
    setSentTo('');
    setCode('');
    onCancel();
  };

  const send = async () => {
    setSending(true);
    try {
      const { sentTo: masked } = await settingApi.sendLoginCodeTest();
      setSentTo(masked);
    } catch (err) {
      notifyError(err, "We couldn't send the test code. Check the mail settings on the server.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      icon={<KeyRound className="size-5" />}
      title="Check you can receive the code first"
      description="Admins will need a code from their email at every sign-in. Send yourself one now and type it back, so nobody gets locked out if email is not delivering."
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={close} className="max-sm:h-11">Cancel</Button>
          <Button type="button" variant="primary" size="sm" disabled={code.length !== CODE_LENGTH} onClick={() => onVerified(code)} className="max-sm:h-11">
            Turn it on
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Button type="button" variant="outline" size="sm" isLoading={sending} onClick={() => void send()} className="w-fit max-sm:h-11">
          <MailCheck size={15} aria-hidden />
          {sentTo ? 'Send another code' : 'Send me a test code'}
        </Button>
        {sentTo && (
          <p className="t-meta font-display text-text-secondary" role="status">
            Sent to {sentTo}. Look in spam too. If it never arrives, leave this off until the domain is set up to send mail.
          </p>
        )}
        <Input
          id="loginCodeProof"
          label="The 6-digit code from that email"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        />
        <p className="t-meta font-display text-text-muted">The code is checked when you press Save changes.</p>
      </div>
    </Modal>
  );
};

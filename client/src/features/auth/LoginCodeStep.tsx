import { useState, type FormEvent } from 'react';
import { MailCheck } from 'lucide-react';
import { Button, Input, Switch } from '../../components';
import { useResendLoginCodeMutation, useVerifyLoginCodeMutation } from './hooks';

interface LoginCodeStepProps {
  challenge: string;
  emailHint: string;
  onBack: () => void;
}

export const LoginCodeStep = ({ challenge, emailHint, onBack }: LoginCodeStepProps) => {
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(true);
  const verify = useVerifyLoginCodeMutation();
  const resend = useResendLoginCodeMutation();
  const ready = /^[0-9]{6}$/.test(code);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready && !verify.isPending) verify.mutate({ challenge, code, rememberDevice: remember });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5" noValidate>
      <div className="flex items-start gap-3 rounded-xl border border-primary-500/30 bg-primary-500/10 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
          <MailCheck size={18} strokeWidth={2.25} />
        </span>
        <p className="t-meta font-display font-medium text-text-secondary leading-relaxed">
          We sent a 6-digit code to <span className="font-semibold text-text">{emailHint}</span>. It works for 10 minutes.
        </p>
      </div>

      <Input
        id="login-code"
        label="Sign-in code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="123456"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        autoFocus
      />

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="trust-device" className="t-meta font-display font-semibold text-text-secondary">Skip this code on this device for 30 days</label>
        <Switch id="trust-device" checked={remember} onChange={setRemember} />
      </div>

      {verify.isError && (
        <p role="alert" className="t-meta text-danger text-center">
          {verify.error instanceof Error ? verify.error.message : "That code didn't work. Try again."}
        </p>
      )}

      <Button type="submit" variant="primary" size="md" isLoading={verify.isPending} disabled={!ready} className="w-full font-medium text-sm">
        Verify and sign in
      </Button>

      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={onBack} className="font-display t-meta text-text-muted hover:text-text transition-colors cursor-pointer">
          Use a different account
        </button>
        <button
          type="button"
          onClick={() => resend.mutate(challenge)}
          disabled={resend.isPending}
          className="font-display t-meta text-primary-600 hover:text-primary-500 transition-colors cursor-pointer disabled:opacity-50"
        >
          Send a new code
        </button>
      </div>
    </form>
  );
};

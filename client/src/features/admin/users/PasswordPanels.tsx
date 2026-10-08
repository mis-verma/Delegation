import { useState } from 'react';
import { CheckCircle2, Copy, Eye, EyeOff, KeyRound, Wand2 } from 'lucide-react';
import { Button, Input, NoticeBanner } from '../../../components';
import { useResetUserPasswordMutation } from '../hook';
import { MIN_PASSWORD_LENGTH, copyText, generatePassword } from './passwordTools';

// Eye button that sits inside a password Input.
export const PasswordVisibilityToggle = ({ shown, onToggle }: { shown: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex items-center justify-center size-8 pointer-coarse:size-11 -mr-2 rounded-md text-text-light hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
    aria-label={shown ? 'Hide password' : 'Show password'}
  >
    {shown ? <EyeOff size={15} /> : <Eye size={15} />}
  </button>
);

interface PasswordSharedPanelProps {
  password: string;
  /** Shown above the password so it is clear which account it belongs to. */
  email?: string;
  onDone: () => void;
}

// Shown once, right after a password is set. The password is not stored anywhere readable after
// this, so this is the admin's one chance to copy it and pass it on.
export const PasswordSharedPanel = ({ password, email, onDone }: PasswordSharedPanelProps) => (
  <NoticeBanner tone="success" icon={CheckCircle2} className="flex-col">
    <div className="flex flex-col gap-3">
      <p className="font-semibold">Temporary password ready. Share it with them.</p>
      <div className="flex flex-col gap-1.5">
        {email && <p className="text-text-secondary">{email}</p>}
        <div className="flex items-center gap-2">
          <code className="flex-1 min-w-0 truncate px-3 py-2 rounded-md border border-border bg-surface text-text text-sm font-mono select-all">
            {password}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={() => copyText(password)}>
            <Copy size={13} aria-hidden />
            Copy
          </Button>
        </div>
      </div>
      <p className="text-text-secondary">
        They choose their own password the first time they sign in, so only they will ever know it. You will not be able to see this one again after you close this.
      </p>
      <div>
        <Button type="button" variant="primary" size="sm" onClick={onDone}>Done</Button>
      </div>
    </div>
  </NoticeBanner>
);

interface ResetPasswordSectionProps {
  userId: string;
  email?: string;
  /** Start open (the kebab's "Reset password" dialog) instead of as a quiet link. */
  defaultExpanded?: boolean;
  /** Called when the person finishes: after Done, or Cancel on an opened-by-default section. */
  onFinished?: () => void;
}

// Its own mutation (POST /users/:id/reset-password), not a field on the profile form, and rendered
// outside the form's <form> tag so pressing Enter here can never submit the whole profile.
export const ResetPasswordSection = ({ userId, email, defaultExpanded = false, onFinished }: ResetPasswordSectionProps) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  // The quick path first: one button makes a temporary password. Typing one is the second choice.
  const [manual, setManual] = useState(false);
  const [password, setPassword] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedPassword, setSavedPassword] = useState<string | null>(null);
  const resetMutation = useResetUserPasswordMutation();

  const collapse = () => {
    setPassword('');
    setError(null);
    setShown(false);
    setSavedPassword(null);
    setManual(false);
    setExpanded(defaultExpanded);
    onFinished?.();
  };

  const handleReset = () => {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Use at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    resetMutation.mutate({ id: userId, password }, { onSuccess: () => { setSavedPassword(password); setPassword(''); } });
  };

  // One click: make a strong temporary password and set it straight away.
  const createTemporary = () => {
    const generated = generatePassword();
    resetMutation.mutate({ id: userId, password: generated }, { onSuccess: () => setSavedPassword(generated) });
  };

  const generate = () => {
    setPassword(generatePassword());
    setShown(true);
    setError(null);
  };

  if (savedPassword) {
    return <PasswordSharedPanel password={savedPassword} email={email} onDone={collapse} />;
  }

  if (!expanded) {
    return (
      <div className="pt-3 border-t border-border">
        <Button type="button" variant="ghost" size="sm" onClick={() => setExpanded(true)}>
          <KeyRound className="size-3.5" aria-hidden />
          Reset password
        </Button>
      </div>
    );
  }

  if (!manual) {
    return (
      <div className={defaultExpanded ? 'flex flex-col gap-3' : 'flex flex-col gap-3 pt-3 border-t border-border'}>
        <p className="text-sm font-display text-text-secondary leading-relaxed">
          Make a temporary password and share it with them. They will be asked to choose their own the first time they sign in, so nobody else ever knows it.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="primary" size="sm" onClick={createTemporary} isLoading={resetMutation.isPending}>
            <Wand2 size={13} aria-hidden />
            Create temporary password
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setManual(true)} disabled={resetMutation.isPending}>
            Type one myself
          </Button>
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={collapse} disabled={resetMutation.isPending}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className={defaultExpanded ? 'flex flex-col gap-3' : 'flex flex-col gap-3 pt-3 border-t border-border'}
      onSubmit={(e) => { e.preventDefault(); handleReset(); }}
      noValidate
    >
      <Input
        id={`reset-password-${userId}`}
        label="Temporary password"
        type={shown ? 'text' : 'password'}
        placeholder={`At least ${MIN_PASSWORD_LENGTH} characters, a capital letter and a number`}
        icon={KeyRound}
        value={password}
        onChange={(e) => { setPassword(e.target.value); setError(null); }}
        error={error ?? undefined}
        autoComplete="new-password"
        autoFocus={expanded && !defaultExpanded}
        suffix={<PasswordVisibilityToggle shown={shown} onToggle={() => setShown((v) => !v)} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={generate} disabled={resetMutation.isPending}>
          <Wand2 size={13} aria-hidden />
          Generate
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => copyText(password)} disabled={!password || resetMutation.isPending}>
          <Copy size={13} aria-hidden />
          Copy
        </Button>
        <span className="flex-1" />
        <Button type="button" variant="ghost" size="sm" onClick={collapse} disabled={resetMutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" isLoading={resetMutation.isPending}>
          Set temporary password
        </Button>
      </div>
    </form>
  );
};

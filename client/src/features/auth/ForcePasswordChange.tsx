import { useState } from 'react';
import { Check, Circle, Eye, EyeOff, KeyRound, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Input, NoticeBanner, PANEL_CLASS } from '../../components';
import { useAuth } from '../../context/AuthContext';
import { useChangeMyPasswordMutation } from '../settings/hook';

const RULES = [
  { key: 'length', label: 'At least 8 characters', test: (v: string) => v.length >= 8 },
  { key: 'upper', label: 'A capital letter', test: (v: string) => /[A-Z]/.test(v) },
  { key: 'digit', label: 'A number', test: (v: string) => /[0-9]/.test(v) },
] as const;

const VisibilityToggle = ({ shown, onToggle }: { shown: boolean; onToggle: () => void }) => (
  <button
    type="button"
    onClick={onToggle}
    className="flex items-center justify-center size-8 -mr-2 rounded-md text-text-light hover:text-text transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
    aria-label={shown ? 'Hide password' : 'Show password'}
  >
    {shown ? <EyeOff size={15} /> : <Eye size={15} />}
  </button>
);

export const ForcePasswordChange = () => {
  const { user, logout } = useAuth();
  const change = useChangeMyPasswordMutation();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const failedRules = RULES.filter((r) => !r.test(next));
  const mismatch = confirm.length > 0 && confirm !== next;

  const submit = () => {
    if (!current) return setError('Enter the temporary password you were given.');
    if (failedRules.length > 0) return setError('Your new password needs to meet every point below.');
    if (next === current) return setError('Choose a password that is different from the temporary one.');
    if (next !== confirm) return setError('The two new passwords do not match.');
    setError(null);
    change.mutate({ currentPassword: current, newPassword: next });
  };

  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-background p-4">
      <div className={cn(PANEL_CLASS, 'w-full max-w-md flex flex-col gap-5 p-5 sm:p-7')}>
        <div className="flex items-start gap-3">
          <span className="flex items-center justify-center size-11 rounded-xl bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 shrink-0">
            <KeyRound size={20} aria-hidden />
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <h1 className="text-lg font-display font-bold text-text leading-snug">Choose your own password</h1>
            <p className="text-sm font-display text-text-muted leading-relaxed">
              {user?.name ? `Hi ${user.name}. ` : ''}Your account was set up with a temporary password. Pick one only you know, then sign in again.
            </p>
          </div>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          noValidate
        >
          <Input
            id="force-current-password"
            label="Temporary password"
            type={shown ? 'text' : 'password'}
            autoComplete="current-password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setError(null); }}
            autoFocus
          />
          <Input
            id="force-new-password"
            label="New password"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            value={next}
            onChange={(e) => { setNext(e.target.value); setError(null); }}
            suffix={<VisibilityToggle shown={shown} onToggle={() => setShown((v) => !v)} />}
          />
          <ul className="flex flex-col gap-1.5" aria-label="Password rules">
            {RULES.map((r) => {
              const ok = r.test(next);
              return (
                <li key={r.key} className={cn('flex items-center gap-2 text-xs font-display', ok ? 'text-success' : 'text-text-muted')}>
                  {ok ? <Check size={13} strokeWidth={3} aria-hidden /> : <Circle size={13} aria-hidden />}
                  {r.label}
                </li>
              );
            })}
          </ul>
          <Input
            id="force-confirm-password"
            label="Confirm new password"
            type={shown ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            error={mismatch ? 'The two passwords do not match' : undefined}
          />

          {error && <NoticeBanner tone="danger" icon={KeyRound}>{error}</NoticeBanner>}

          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 pt-1">
            <Button type="button" variant="ghost" size="lg" onClick={logout} disabled={change.isPending} className="gap-2">
              <LogOut size={15} aria-hidden />
              Sign out
            </Button>
            <span className="hidden sm:block flex-1" />
            <Button type="submit" variant="primary" size="lg" isLoading={change.isPending}>
              Save new password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};

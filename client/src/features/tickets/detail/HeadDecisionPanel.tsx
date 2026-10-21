import { ArrowRight, Ban, Check, CircleCheck, Hourglass, Play, Send, ShieldQuestion, User } from 'lucide-react';
import { Button } from '../../../components';
import { avatarColorClass } from '../../../lib/avatarColors';
import { getInitials } from '../../../lib/getInitials';

interface Person {
  firstName: string;
  lastName?: string | null;
}

interface HeadDecisionPanelProps {
  ticketTitle: string;
  raiser: Person | null;
  assignee: Person | null;
  departmentName?: string;
  canDecide: boolean;
  isApproving: boolean;
  isDeclining: boolean;
  onApprove: () => void;
  onDecline: () => void;
}

const fullName = (p: Person) => `${p.firstName}${p.lastName ? ` ${p.lastName}` : ''}`.trim();

const PersonPill = ({ person, empty }: { person: Person | null; empty: string }) => {
  const name = person ? fullName(person) : null;
  return (
    <span className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-surface py-1 pl-1 pr-3">
      {name ? (
        <span className={`flex size-7 shrink-0 items-center justify-center rounded-full t-meta font-bold text-white ${avatarColorClass(name)}`} aria-hidden="true">
          {getInitials(name)}
        </span>
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-light" aria-hidden="true">
          <User size={13} />
        </span>
      )}
      <span className={`min-w-0 truncate t-card font-display font-semibold ${name ? 'text-text' : 'text-text-muted'}`}>{name ?? empty}</span>
    </span>
  );
};

type StepState = 'done' | 'current' | 'next';

const Step = ({ icon: Icon, label, state }: { icon: typeof Send; label: string; state: StepState }) => (
  <li className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center" aria-current={state === 'current' ? 'step' : undefined}>
    <span
      className={`flex size-8 items-center justify-center rounded-full border transition-colors duration-200 ${
        state === 'done'
          ? 'border-transparent bg-linear-to-br from-success to-success/70 text-white'
          : state === 'current'
            ? 'border-transparent bg-linear-to-br from-warning to-warning/70 text-white ring-4 ring-warning/20'
            : 'border-border bg-surface text-text-light'
      }`}
    >
      {state === 'done' ? <Check size={15} strokeWidth={3} aria-hidden="true" /> : <Icon size={15} strokeWidth={2.4} aria-hidden="true" />}
    </span>
    <span className={`t-meta font-display font-semibold leading-tight ${state === 'next' ? 'text-text-muted' : 'text-text'}`}>{label}</span>
  </li>
);

const Connector = ({ filled }: { filled: boolean }) => (
  <li aria-hidden="true" className={`mt-4 h-0.5 w-6 shrink-0 rounded-full sm:w-10 ${filled ? 'bg-success/60' : 'bg-border'}`} />
);

export const HeadDecisionPanel = ({
  ticketTitle,
  raiser,
  assignee,
  departmentName,
  canDecide,
  isApproving,
  isDeclining,
  onApprove,
  onDecline,
}: HeadDecisionPanelProps) => {
  const busy = isApproving || isDeclining;
  const raiserName = raiser ? raiser.firstName : 'Someone';
  const where = departmentName ? `${departmentName} department` : 'your department';

  return (
    <section
      aria-label="Department head decision"
      className="flex flex-col gap-4 rounded-xl border border-warning/30 bg-warning/10 p-3.5 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-warning to-warning/70 text-white"
          aria-hidden="true"
        >
          {canDecide ? <ShieldQuestion size={20} strokeWidth={2.3} /> : <Hourglass size={19} strokeWidth={2.3} />}
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="t-section font-display font-bold leading-snug text-text">
            {canDecide ? 'This ticket needs your decision' : `Waiting for the ${departmentName ?? 'department'} head`}
          </h2>
          <p className="t-card font-medium leading-snug text-text-secondary">
            {canDecide
              ? `${raiserName} sent "${ticketTitle}" to the ${where}. Nobody can start until you approve it.`
              : 'Work starts as soon as they approve it. If they decline, you will see their reason here.'}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <PersonPill person={raiser} empty="Unknown" />
        <ArrowRight size={16} className="hidden shrink-0 text-text-light sm:block" strokeWidth={2.5} aria-hidden="true" />
        <PersonPill person={assignee} empty="Nobody picked yet" />
      </div>

      <ol className="flex items-start justify-center" aria-label="Where this ticket is">
        <Step icon={Send} label="Raised" state="done" />
        <Connector filled />
        <Step icon={ShieldQuestion} label="Head decides" state="current" />
        <Connector filled={false} />
        <Step icon={Play} label="Work starts" state="next" />
      </ol>

      {canDecide && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-3">
          <Button
            variant="outline"
            onClick={onDecline}
            disabled={busy}
            isLoading={isDeclining}
            className="h-11 gap-1.5 border-danger/40 font-display font-semibold text-danger hover:border-danger hover:bg-danger/10 hover:text-danger sm:h-10"
          >
            <Ban size={16} aria-hidden="true" />
            Decline
          </Button>
          <Button
            variant="primary"
            onClick={onApprove}
            disabled={busy}
            isLoading={isApproving}
            className="h-11 gap-1.5 bg-linear-to-br from-success to-success/80 font-display font-semibold text-white hover:from-success/90 hover:to-success/70 hover:text-white sm:h-10"
          >
            <CircleCheck size={16} aria-hidden="true" />
            Approve
          </Button>
        </div>
      )}
    </section>
  );
};

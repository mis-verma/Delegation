import { BriefcaseBusiness } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PANEL_CLASS } from '../../components/entityCard';
import { useMyExtraWorkingDaysQuery } from '../admin/holidays/hook';

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

/**
 * "You are working on Sunday": the next extra working day (overtime) that covers this person, with its
 * reason, so nobody is surprised by checklists on a day that is normally off. Nothing shows when there is none.
 */
export const OvertimeNotice = ({ today }: { today: string }) => {
  const { data } = useMyExtraWorkingDaysQuery();
  const next = (data ?? []).find((d) => d.date >= today);
  if (!next) return null;
  const isToday = next.date === today;
  // An admin may already end the reason with a full stop; don't add a second one.
  const reason = next.reason.trim();
  const reasonSentence = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  return (
    <section aria-label="Extra working day" className={cn(PANEL_CLASS, 'flex items-center gap-3 px-4 py-3')}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
        <BriefcaseBusiness className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="t-card font-display font-semibold text-text">
          {isToday ? 'Today is an extra working day' : `Extra working day: ${DAY.format(new Date(`${next.date}T00:00:00Z`))}`}
        </p>
        <p className="t-meta text-text-muted">{reasonSentence} Your checklists run that day.</p>
      </div>
    </section>
  );
};

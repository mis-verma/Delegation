import { BriefcaseBusiness } from 'lucide-react';
import { useMyExtraWorkingDaysQuery } from '../admin/holidays/hook';

const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const OvertimeNotice = ({ today }: { today: string }) => {
  const { data } = useMyExtraWorkingDaysQuery();
  const next = (data ?? []).find((d) => d.date >= today);
  if (!next) return null;
  const isToday = next.date === today;
  const reason = next.reason.trim();
  const reasonSentence = /[.!?]$/.test(reason) ? reason : `${reason}.`;
  return (
    <section aria-label="Extra working day" className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/8 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning" aria-hidden="true">
        <BriefcaseBusiness className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="line-clamp-2 t-card font-display font-bold text-text">
          {isToday ? 'Today is an extra working day' : `Extra working day: ${DAY.format(new Date(`${next.date}T00:00:00Z`))}`}
        </p>
        <p className="line-clamp-2 t-meta text-text-muted">{reasonSentence} Your checklists run that day.</p>
      </div>
    </section>
  );
};

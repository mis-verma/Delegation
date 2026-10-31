import { useOrgToday } from '../checklist/useOrgToday';
import { windowFor } from '../dashboard/scorePeriods';
import { useScoreExplorer } from '../scores/useScoreExplorer';
import { ScoresTotalCard, ScoresTotalSkeleton } from '../scores/ScoresTotalCard';
import { InlineError } from '../../components';

const MODULES = ['checklist', 'ticket', 'delegation'] as const;

export const PcScoreCards = () => {
  const today = useOrgToday();
  const month = windowFor('month', 0, today);
  const to = month.to > today ? today : month.to;
  const explorer = useScoreExplorer({ from: month.from, to, view: 'department' });

  if (explorer.isError && !explorer.data) {
    return <InlineError message="Couldn't load this month's scores." onRetry={() => void explorer.refetch()} />;
  }
  if (!explorer.data) return <ScoresTotalSkeleton />;

  return (
    <ScoresTotalCard
      total={explorer.data.total}
      modules={MODULES}
      title="Whole organisation"
      windowLabel="This month"
      capped={explorer.data.window.capped}
    />
  );
};

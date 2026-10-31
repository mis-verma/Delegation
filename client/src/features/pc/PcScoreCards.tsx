import { usePcMonthScores } from './usePcMonthScores';
import { ScoresTotalCard, ScoresTotalSkeleton } from '../scores/ScoresTotalCard';
import { InlineError } from '../../components';

const MODULES = ['checklist', 'ticket', 'delegation'] as const;

export const PcScoreCards = () => {
  const explorer = usePcMonthScores();

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

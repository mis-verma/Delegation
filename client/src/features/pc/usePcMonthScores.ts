import { useOrgToday } from '../checklist/useOrgToday';
import { windowFor } from '../dashboard/scorePeriods';
import { useScoreExplorer } from '../scores/useScoreExplorer';

export const usePcMonthScores = () => {
  const today = useOrgToday();
  const month = windowFor('month', 0, today);
  const to = month.to > today ? today : month.to;
  return useScoreExplorer({ from: month.from, to, view: 'department' });
};

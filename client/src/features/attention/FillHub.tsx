import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import { Skeleton } from '../../components';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { FillHeatmapPage } from './FillHeatmapPage';

const ChecklistWeeklyReport = lazy(() => import('../checklist').then((m) => ({ default: m.ChecklistWeeklyReport })));

type FillTab = 'person' | 'checklist';

const TABS: readonly FillTab[] = ['person', 'checklist'];
const LABELS: Record<FillTab, string> = { person: 'By person', checklist: 'By checklist' };
const PATH: Record<FillTab, string> = { person: '/team/fill', checklist: '/team/fill/checklists' };

export const FillHub = ({ tab }: { tab: FillTab }) => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4">
      <PeriodTabControl value={tab} options={TABS} labels={LABELS} onChange={(next) => void navigate(PATH[next])} className="w-full sm:w-fit" fill />
      {tab === 'person' ? (
        <FillHeatmapPage />
      ) : (
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <ChecklistWeeklyReport />
        </Suspense>
      )}
    </div>
  );
};

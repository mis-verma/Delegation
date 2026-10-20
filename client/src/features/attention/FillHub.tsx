import { lazy, Suspense } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Skeleton } from '../../components';
import { ADMIN_AREA_ROLES } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { FillHeatmapPage } from './FillHeatmapPage';

const ChecklistWeeklyReport = lazy(() => import('../checklist').then((m) => ({ default: m.ChecklistWeeklyReport })));
const ChecklistComplianceBoard = lazy(() => import('../checklist').then((m) => ({ default: m.ChecklistComplianceBoard })));

type FillTab = 'person' | 'checklist' | 'compliance';

const LABELS: Record<FillTab, string> = { person: 'By person', checklist: 'By checklist', compliance: 'Compliance' };
const PATH: Record<FillTab, string> = { person: '/team/fill', checklist: '/team/fill/checklists', compliance: '/team/fill/compliance' };

export const FillHub = ({ tab }: { tab: FillTab }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canSeeCompliance = !!user && ADMIN_AREA_ROLES.includes(user.role);
  const tabs: readonly FillTab[] = canSeeCompliance ? ['person', 'checklist', 'compliance'] : ['person', 'checklist'];
  if (tab === 'compliance' && user && !canSeeCompliance) return <Navigate to="/team/fill/checklists" replace />;
  return (
    <div className="flex flex-col gap-5">
      <PeriodTabControl value={tab} options={tabs} labels={LABELS} onChange={(next) => void navigate(PATH[next])} className="w-full sm:w-fit" fill />
      {tab === 'person' && <FillHeatmapPage />}
      {tab !== 'person' && (
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          {tab === 'checklist' ? <ChecklistWeeklyReport /> : <ChecklistComplianceBoard />}
        </Suspense>
      )}
    </div>
  );
};

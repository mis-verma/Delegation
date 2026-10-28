import { Suspense, lazy } from 'react';
import { useSearchParams } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { PageHeader, Skeleton } from '../../components';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import { TicketApprovals } from './TicketApprovals';

const ChecklistApprovals = lazy(() => import('../checklist').then((m) => ({ default: m.ChecklistApprovals })));
const ApprovalCoverCard = lazy(() => import('../checklist/ApprovalCoverCard').then((m) => ({ default: m.ApprovalCoverCard })));

type ApprovalsTab = 'work' | 'checklists';

const TABS: readonly ApprovalsTab[] = ['work', 'checklists'];
const LABELS: Record<ApprovalsTab, string> = { work: 'Requests and finished work', checklists: 'Checklists' };

export const TeamApprovalsPage = () => {
  const [params, setParams] = useSearchParams();
  const tab: ApprovalsTab = params.get('tab') === 'checklists' ? 'checklists' : 'work';

  const change = (next: ApprovalsTab) => {
    setParams(next === 'work' ? {} : { tab: next }, { replace: true });
  };

  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader icon={ShieldCheck} title="Team approvals" subtitle="Decide on new requests, approve finished work and review checklists for your department." />
      <Suspense fallback={null}>
        <ApprovalCoverCard />
      </Suspense>
      <PeriodTabControl value={tab} options={TABS} labels={LABELS} onChange={change} className="w-full sm:w-fit" fill />
      {tab === 'work' ? (
        <TicketApprovals embedded />
      ) : (
        <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
          <ChecklistApprovals embedded />
        </Suspense>
      )}
    </div>
  );
};

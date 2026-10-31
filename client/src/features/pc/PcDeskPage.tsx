import { UserCheck } from 'lucide-react';
import { PageHeader } from '../../components';
import { CoverBanner } from '../dashboard/CoverBanner';
import { NeedsApprovalCard } from '../dashboard/NeedsApprovalCard';
import { ExceptionsCard } from '../dashboard/ExceptionsCard';
import { PcStatTiles } from './PcStatTiles';
import { PcScoreCards } from './PcScoreCards';

export const PcDeskPage = () => (
  <div className="flex flex-col gap-6 pt-2.5">
    <PageHeader icon={UserCheck} title="PC desk" subtitle="Approvals that need you, and what is not done today." />
    <CoverBanner />
    <PcStatTiles />
    <PcScoreCards />
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
      <NeedsApprovalCard />
      <ExceptionsCard />
    </div>
  </div>
);

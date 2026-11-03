import { CoverBanner } from '../dashboard/CoverBanner';
import { NeedsApprovalCard } from '../dashboard/NeedsApprovalCard';
import { ExceptionsCard } from '../dashboard/ExceptionsCard';
import { PcStatusBar } from './PcStatusBar';
import { PcOrgFigures } from './PcOrgFigures';
import { PcMyWork } from './PcMyWork';
import { PcScoreCards } from './PcScoreCards';

export const PcDeskPage = () => (
  <div className="flex flex-col gap-6 pt-2.5">
    <h1 className="sr-only">PC desk</h1>
    <CoverBanner />
    <PcStatusBar />
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] xl:items-start">
      <div className="min-w-0">
        <NeedsApprovalCard hideOpenWork />
      </div>
      <div className="flex min-w-0 flex-col gap-6">
        <PcOrgFigures />
        <ExceptionsCard />
      </div>
    </div>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
      <PcMyWork />
      <PcScoreCards />
    </div>
  </div>
);

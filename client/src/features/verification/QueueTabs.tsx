import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';
import type { QueueTab, QueueView } from './verificationModel';

const TRIGGER = 'min-h-11 sm:min-h-9 px-2.5 sm:px-4 text-xs sm:text-sm';

const Count = ({ value }: { value: number | null }) =>
  value === null ? null : <span className="tabular-nums text-text-light">{value}</span>;

interface ViewTabsProps {
  view: QueueView;
  onChange: (view: QueueView) => void;
  waiting: number | null;
  decided: number | null;
}

/** Waiting (the work) or Decided today (what was just done). */
export const ViewTabs = ({ view, onChange, waiting, decided }: ViewTabsProps) => (
  <Tabs value={view} onValueChange={(v) => onChange(v as QueueView)}>
    <TabsList className="w-full sm:w-fit" aria-label="Waiting or decided today">
      <TabsTrigger value="waiting" className={TRIGGER}>Waiting <Count value={waiting} /></TabsTrigger>
      <TabsTrigger value="decided" className={TRIGGER}>Decided today <Count value={decided} /></TabsTrigger>
    </TabsList>
  </Tabs>
);

interface TypeTabsProps {
  tab: QueueTab;
  onChange: (tab: QueueTab) => void;
  counts: { all: number; checklists: number; tickets: number; delegations: number } | null;
}

/** All / Checklists / Tickets / Delegations, each with how many are waiting. */
export const TypeTabs = ({ tab, onChange, counts }: TypeTabsProps) => (
  <Tabs value={tab} onValueChange={(v) => onChange(v as QueueTab)}>
    <TabsList className="w-full sm:w-fit" aria-label="Type of item">
      <TabsTrigger value="all" className={TRIGGER}>All <Count value={counts?.all ?? null} /></TabsTrigger>
      <TabsTrigger value="checklists" className={TRIGGER}>Checklists <Count value={counts?.checklists ?? null} /></TabsTrigger>
      <TabsTrigger value="tickets" className={TRIGGER}>Tickets <Count value={counts?.tickets ?? null} /></TabsTrigger>
      <TabsTrigger value="delegations" className={TRIGGER}>Delegations <Count value={counts?.delegations ?? null} /></TabsTrigger>
    </TabsList>
  </Tabs>
);

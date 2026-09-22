import { useState } from 'react';
import { FileDown, Ticket, ClipboardList, ListChecks } from 'lucide-react';
import { ReportExportPanel } from './ReportExportPanel';
import type { ReportModule } from '../../api/reports';

const MODULES: { key: ReportModule; label: string; icon: typeof Ticket; description: string }[] = [
  {
    key: 'tickets',
    label: 'Tickets',
    icon: Ticket,
    description: 'Every ticket created in the selected period — status, priority, department, assignee, and TAT.',
  },
  {
    key: 'tasks',
    label: 'Delegations',
    icon: ClipboardList,
    description: 'Every delegation created in the selected period — status, priority, department, and assignee.',
  },
  {
    key: 'checklists',
    label: 'Checklists',
    icon: ListChecks,
    description: 'Every recurring checklist instance generated in the selected period — completion progress per instance.',
  },
];

export const ReportsPage = () => {
  const [activeModule, setActiveModule] = useState<ReportModule>('tickets');
  const active = MODULES.find((m) => m.key === activeModule)!;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-primary-500/10 to-primary-700/10 dark:from-primary-500/20 dark:to-primary-700/20 text-primary-600 dark:text-primary-400 ring-1 ring-primary-500/20 shrink-0">
          <FileDown className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-xl font-display font-bold text-text tracking-tight">Reports</h1>
          <p className="text-xs text-text-muted font-display mt-0.5">
            Download CSV/XLSX exports for a given period.
          </p>
        </div>
      </div>

      {/* Module Tabs */}
      <div className="flex gap-1 p-1 bg-surface-hover rounded-lg w-fit">
        {MODULES.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveModule(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-display font-medium rounded-md transition-colors cursor-pointer ${
              activeModule === key ? 'bg-surface text-text shadow-sm' : 'text-text-muted hover:text-text-secondary'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      <ReportExportPanel reportModule={active.key} description={active.description} />
    </div>
  );
};

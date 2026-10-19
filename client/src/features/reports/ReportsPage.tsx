import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, FileDown, Ticket, ClipboardList, ListChecks, Trophy, Grid3x3, Check, type LucideIcon } from 'lucide-react';
import { PageHeader, IconChip } from '../../components';
import { cn } from '@/lib/utils';
import { ReportExportPanel } from './ReportExportPanel';
import type { ReportModule } from '../../api/reports';

interface ModuleDef {
  key: ReportModule;
  label: string;
  icon: LucideIcon;
  tile: string;
  description: string;
  covers: string;
}

const MODULES: ModuleDef[] = [
  {
    key: 'tickets',
    label: 'Tickets',
    icon: Ticket,
    tile: 'from-success to-success-strong',
    description: 'Every ticket created in the selected period, with status, priority, department, assignee and TAT.',
    covers: 'Status, priority, TAT',
  },
  {
    key: 'tasks',
    label: 'Delegations',
    icon: ClipboardList,
    tile: 'from-coral-500 to-coral-600',
    description: 'Every delegation created in the selected period, with status, priority, department and assignee.',
    covers: 'Status, priority, assignee',
  },
  {
    key: 'checklists',
    label: 'Checklists',
    icon: ListChecks,
    tile: 'from-primary-500 to-primary-700',
    description: 'Every recurring checklist instance generated in the selected period, with completion progress per instance.',
    covers: 'Runs and completion',
  },
];

const MORE: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: '/admin/scores', label: 'Scores tables', hint: 'Department, store and people rankings, with their own Export', icon: Trophy },
  { to: '/team/fill/checklists', label: 'Checklist fill report', hint: 'Mon to Sun fill matrix, with its own Export', icon: Grid3x3 },
];

export const ReportsPage = () => {
  const [activeModule, setActiveModule] = useState<ReportModule>('tickets');
  const active = MODULES.find((m) => m.key === activeModule)!;

  return (
    <div className="flex w-full max-w-4xl flex-col gap-5">
      <PageHeader icon={FileDown} title="Reports" subtitle="Download CSV or Excel files for a period. Pick what to export, then the dates." />

      <div role="radiogroup" aria-label="What to export" className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {MODULES.map(({ key, label, icon: Icon, tile, covers }) => {
          const selected = key === activeModule;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setActiveModule(key)}
              className={cn(
                'flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-3 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]',
                selected ? 'border-primary-500/60 bg-primary-500/8' : 'border-border/60 bg-surface hover:border-border-hover',
              )}
            >
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white', tile)} aria-hidden="true">
                <Icon className="size-5" strokeWidth={2.25} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="t-card font-display font-bold text-text">{label}</span>
                <span className="t-meta text-text-muted">{covers}</span>
              </span>
              {selected && <IconChip icon={Check} tone="bg-primary-600" label="Selected" iconOnlyOnMobile />}
            </button>
          );
        })}
      </div>

      <ReportExportPanel reportModule={active.key} description={active.description} />

      <section aria-label="Other exports" className="flex flex-col gap-2">
        <h2 className="t-card font-display font-bold text-text">Also exportable</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-3">
          {MORE.map(({ to, label, hint, icon: Icon }) => (
            <Link
              key={to}
              viewTransition
              to={to}
              className="group flex min-h-14 items-center gap-3 rounded-xl border border-border/60 bg-surface p-3 outline-none transition-colors duration-150 hover:border-border-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.985]"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-primary-500 to-primary-700 text-white" aria-hidden="true">
                <Icon className="size-4.5" strokeWidth={2.25} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="t-card font-display font-bold text-text">{label}</span>
                <span className="t-meta text-text-muted">{hint}</span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-text-light transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

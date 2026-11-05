import { useState, useCallback, useEffect, useMemo } from 'react';
import { CoverBanner } from '../dashboard/CoverBanner';
import { NeedsApprovalCard } from '../dashboard/NeedsApprovalCard';
import { ExceptionsCard } from '../dashboard/ExceptionsCard';
import { PcStatusBar } from './PcStatusBar';
import { PcOrgFigures } from './PcOrgFigures';
import { PcMyWork } from './PcMyWork';
import { PcScoreCards } from './PcScoreCards';
import { usePcApprovalBuckets } from './usePcApprovalBuckets';
import { useExceptionTotalsQuery } from '../dashboard/useExceptionsQuery';
import { useIsMobile } from '../../lib/useMediaQuery';
import { haptic } from '../../lib/haptics';
import { cn } from '@/lib/utils';
import {
  ShieldAlert,
  Activity,
  Briefcase,
  LayoutGrid,
  Zap,
  SlidersHorizontal,
  Flame,
} from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

export type PcViewMode = 'all' | 'queue' | 'pulse' | 'mywork';

export const PcDeskPage = () => {
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const { approvals, total } = usePcApprovalBuckets();
  const exceptionTotals = useExceptionTotalsQuery();

  // On phones/tablets default to 'queue' for fast, zero-scroll triage; on desktops default to 'all'
  const [viewMode, setViewMode] = useState<PcViewMode>(() => (isMobile ? 'queue' : 'all'));

  const overdueCount = useMemo(() => {
    const d = exceptionTotals.data;
    if (!d) return 0;
    return (d.tickets ?? 0) + (d.delegations ?? 0) + (d.missedRuns ?? 0);
  }, [exceptionTotals.data]);

  const selectTab = useCallback((mode: PcViewMode) => {
    haptic('tap');
    setViewMode(mode);
  }, []);

  // Keyboard navigation for power-user speed
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '1') selectTab('queue');
      else if (e.key === '2') selectTab('pulse');
      else if (e.key === '3') selectTab('mywork');
      else if (e.key === '0') selectTab('all');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectTab]);

  const handleRefreshAll = useCallback(async () => {
    await Promise.all([
      approvals.tasks.refetch(),
      approvals.tickets.refetch(),
      approvals.checklists.refetch(),
      exceptionTotals.refetch(),
    ]);
  }, [approvals, exceptionTotals]);

  const tabs: { id: PcViewMode; label: string; icon: typeof Zap; badge?: number; badgeVariant?: 'primary' | 'danger' }[] = [
    {
      id: 'queue',
      label: 'Decision Queue',
      icon: Zap,
      badge: total.pending > 0 ? total.pending : undefined,
      badgeVariant: total.old > 0 ? 'danger' : 'primary',
    },
    {
      id: 'pulse',
      label: 'Org Pulse & Exceptions',
      icon: Activity,
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeVariant: 'danger',
    },
    {
      id: 'mywork',
      label: 'My Work & Scores',
      icon: Briefcase,
    },
    {
      id: 'all',
      label: 'All Views',
      icon: LayoutGrid,
    },
  ];

  return (
    <div className="flex flex-col gap-5 pt-2 mx-auto w-full max-w-(--container-width) transition-all duration-300">
      <h1 className="sr-only">PC desk</h1>
      <CoverBanner />
      <PcStatusBar onRefreshAll={handleRefreshAll} />

      {/* Fast Workflow Mode Switcher */}
      <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div
          role="tablist"
          aria-label="PC Desk Views"
          className="inline-flex items-center gap-1 rounded-2xl border border-border/70 bg-surface p-1 shadow-xs"
        >
          {tabs.map(({ id, label, icon: Icon, badge, badgeVariant }) => {
            const isActive = viewMode === id;
            return (
              <button
                key={id}
                role="tab"
                type="button"
                aria-selected={isActive}
                onClick={() => selectTab(id)}
                className={cn(
                  'group relative inline-flex min-h-10 pointer-coarse:min-h-11 items-center gap-2 rounded-xl px-3.5 py-1.5 t-meta font-display font-bold outline-none transition-all duration-200 cursor-pointer select-none',
                  'focus-visible:ring-2 focus-visible:ring-primary-500/50',
                  isActive
                    ? 'bg-primary-800 text-white shadow-xs dark:bg-primary-500'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text'
                )}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0 transition-colors',
                    isActive ? 'text-white' : 'text-text-muted group-hover:text-text'
                  )}
                  aria-hidden="true"
                />
                <span className="whitespace-nowrap">{label}</span>
                {badge !== undefined && (
                  <span
                    className={cn(
                      'inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-bold tabular-nums',
                      isActive
                        ? 'bg-white/25 text-white'
                        : badgeVariant === 'danger'
                          ? 'bg-danger/15 text-danger border border-danger/30'
                          : 'bg-primary-500/15 text-primary-600 dark:text-primary-300 border border-primary-500/30'
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:flex items-center gap-2 text-text-muted/60 t-meta font-medium select-none pr-1">
          <span className="inline-flex items-center gap-1">
            <kbd className="rounded border border-border/80 bg-surface px-1.5 py-0.5 text-[11px] font-mono shadow-2xs">1</kbd>
            <kbd className="rounded border border-border/80 bg-surface px-1.5 py-0.5 text-[11px] font-mono shadow-2xs">2</kbd>
            <kbd className="rounded border border-border/80 bg-surface px-1.5 py-0.5 text-[11px] font-mono shadow-2xs">3</kbd>
            <kbd className="rounded border border-border/80 bg-surface px-1.5 py-0.5 text-[11px] font-mono shadow-2xs">0</kbd>
            <span className="ml-1 text-[11px]">quick switch</span>
          </span>
        </div>
      </div>

      {/* Dynamic Content Views */}
      <AnimatePresence mode="wait">
        {viewMode === 'queue' && (
          <motion.div
            key="queue"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-6"
          >
            <NeedsApprovalCard hideOpenWork />
          </motion.div>
        )}

        {viewMode === 'pulse' && (
          <motion.div
            key="pulse"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-6"
          >
            <PcOrgFigures />
            <ExceptionsCard />
          </motion.div>
        )}

        {viewMode === 'mywork' && (
          <motion.div
            key="mywork"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start"
          >
            <PcMyWork />
            <PcScoreCards />
          </motion.div>
        )}

        {viewMode === 'all' && (
          <motion.div
            key="all"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-6"
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.18fr)_minmax(0,1fr)] xl:items-start">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

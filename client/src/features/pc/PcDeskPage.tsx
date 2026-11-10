import { useCallback, useEffect, useId, useMemo, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Activity, Briefcase, LayoutGrid, Zap } from 'lucide-react';
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
import { DASHBOARD_QUERY_ROOTS } from '../../lib/dashboardQuery';
import { haptic } from '../../lib/haptics';
import { cn } from '@/lib/utils';

export type PcViewMode = 'all' | 'queue' | 'pulse' | 'mywork';

const VIEW_MODES: readonly PcViewMode[] = ['queue', 'pulse', 'mywork', 'all'];
const SHORTCUT: Record<string, PcViewMode> = { '1': 'queue', '2': 'pulse', '3': 'mywork', '0': 'all' };
const REFRESH_ROOTS: readonly string[] = [...DASHBOARD_QUERY_ROOTS, 'leave'];

const isPcViewMode = (value: string | null): value is PcViewMode => !!value && (VIEW_MODES as readonly string[]).includes(value);

const typingTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

interface TabDef {
  id: PcViewMode;
  label: string;
  icon: typeof Zap;
  badge?: number;
  badgeTone?: 'primary' | 'danger';
  badgeLabel?: string;
}

export const PcDeskPage = () => {
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { total } = usePcApprovalBuckets();
  const exceptionTotals = useExceptionTotalsQuery();
  const idBase = useId();
  const tabRefs = useRef<Partial<Record<PcViewMode, HTMLButtonElement | null>>>({});

  const requested = searchParams.get('view');
  const viewMode: PcViewMode = isPcViewMode(requested) ? requested : isMobile ? 'queue' : 'all';

  const overdueCount = useMemo(() => {
    const d = exceptionTotals.data;
    if (!d) return 0;
    return (d.tickets ?? 0) + (d.delegations ?? 0) + (d.missedRuns ?? 0);
  }, [exceptionTotals.data]);

  const selectTab = useCallback((mode: PcViewMode, focus = false) => {
    haptic('tap');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', mode);
      return next;
    }, { replace: true });
    if (focus) tabRefs.current[mode]?.focus();
  }, [setSearchParams]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (typingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const mode = SHORTCUT[e.key];
      if (mode) selectTab(mode);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectTab]);

  const handleRefreshAll = useCallback(async () => {
    const matches = (key: readonly unknown[]) => typeof key[0] === 'string' && REFRESH_ROOTS.includes(key[0]);
    await queryClient.invalidateQueries({ predicate: (query) => matches(query.queryKey) });
    const failed = queryClient.getQueryCache().findAll({ type: 'active', predicate: (query) => matches(query.queryKey) })
      .some((query) => query.state.status === 'error');
    if (failed) throw new Error('Some figures did not load');
  }, [queryClient]);

  const tabs: TabDef[] = [
    {
      id: 'queue',
      label: 'Approvals',
      icon: Zap,
      badge: total.pending > 0 ? total.pending : undefined,
      badgeTone: total.old > 0 ? 'danger' : 'primary',
      badgeLabel: total.old > 0 ? `${total.pending} waiting, ${total.old} over 24 hours` : `${total.pending} waiting`,
    },
    {
      id: 'pulse',
      label: 'Organisation',
      icon: Activity,
      badge: overdueCount > 0 ? overdueCount : undefined,
      badgeTone: 'danger',
      badgeLabel: `${overdueCount} overdue or missed`,
    },
    { id: 'mywork', label: 'My work', icon: Briefcase },
    { id: 'all', label: 'Everything', icon: LayoutGrid },
  ];

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1;
    const target = e.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : e.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
        : e.key === 'Home' ? 0
          : e.key === 'End' ? last
            : null;
    if (target === null) return;
    e.preventDefault();
    selectTab(tabs[target]!.id, true);
  };

  const panelId = `${idBase}-panel`;
  const tabId = (id: PcViewMode) => `${idBase}-tab-${id}`;

  return (
    <div className="flex flex-col gap-6 pt-2.5 mx-auto w-full max-w-(--container-width)">
      <h1 className="sr-only">PC desk</h1>
      <CoverBanner />
      <PcStatusBar onRefreshAll={handleRefreshAll} />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="PC desk views"
          className="grid grid-cols-2 gap-1 rounded-xl border border-border/70 bg-surface p-1 sm:inline-flex sm:w-fit sm:items-center"
        >
          {tabs.map(({ id, label, icon: Icon, badge, badgeTone, badgeLabel }, index) => {
            const isActive = viewMode === id;
            return (
              <button
                key={id}
                ref={(el) => { tabRefs.current[id] = el; }}
                id={tabId(id)}
                role="tab"
                type="button"
                aria-selected={isActive}
                aria-controls={panelId}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectTab(id)}
                onKeyDown={(e) => onTabKeyDown(e, index)}
                className={cn(
                  'group inline-flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-1.5 t-meta font-display font-bold outline-none transition-colors duration-150 ease-out cursor-pointer select-none active:scale-[0.985] sm:min-h-9 sm:pointer-coarse:min-h-11 sm:justify-start',
                  'focus-visible:ring-2 focus-visible:ring-primary-500/50',
                  isActive
                    ? 'bg-primary-800 text-white dark:bg-primary-500'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text'
                )}
              >
                <Icon
                  className={cn('size-4 shrink-0', isActive ? 'text-white' : 'text-text-muted group-hover:text-text')}
                  aria-hidden="true"
                />
                <span className="min-w-0 truncate">{label}</span>
                {badge !== undefined && (
                  <span
                    aria-label={badgeLabel}
                    className={cn(
                      'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 t-meta font-bold tabular-nums',
                      isActive
                        ? 'bg-white/25 text-white'
                        : badgeTone === 'danger'
                          ? 'border border-danger/30 bg-danger/15 text-danger'
                          : 'border border-primary-500/30 bg-primary-500/15 text-primary-600 dark:text-primary-300'
                    )}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <p className="hidden items-center gap-1.5 t-meta font-medium text-text-muted select-none lg:flex pointer-coarse:hidden">
          {['1', '2', '3', '0'].map((key) => (
            <kbd key={key} className="rounded border border-border/80 bg-surface px-1.5 t-meta font-mono">{key}</kbd>
          ))}
          <span>switch views</span>
        </p>
      </div>

      <div
        key={viewMode}
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId(viewMode)}
        className="flex flex-col gap-6 animate-in fade-in duration-150 ease-out motion-reduce:animate-none"
      >
        {viewMode === 'queue' && <NeedsApprovalCard hideOpenWork />}

        {viewMode === 'pulse' && (
          <>
            <PcOrgFigures />
            <ExceptionsCard />
          </>
        )}

        {viewMode === 'mywork' && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 xl:items-start">
            <PcMyWork />
            <PcScoreCards />
          </div>
        )}

        {viewMode === 'all' && (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};

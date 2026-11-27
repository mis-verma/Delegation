import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Download, Grid3x3, SlidersHorizontal, Search, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Combobox, CountBadge, EmptyState, ExportMenu, InlineError, Input, NoticeBanner, PageHeader, PeriodStepper, SelectDropdown, Skeleton, SlidingTabs } from '../../components';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { useStoredChoice } from '../../lib/useStoredChoice';
import { FILL_SORT_OPTIONS, FILL_VIEWS, FILL_VIEW_OPTIONS, sortByScore, type FillSort, type FillView } from '../checklist/instance/fillView';
import { FillPeopleCards } from './FillPeopleCards';
import { fillFilterCounts, fillFilterOptions, matchesFillFilter, type FillFilter } from './fillFilter';
import { downloadCsvNow, exportPct, exportTitle, type TableRows } from '../../lib/exportTable';
import { StatusFigureStats, type StatusFigureItem } from '../dashboard/StatusFigureStats';
import { FillCountCell } from '../checklist/instance/FillCountCell';
import { COUNT_CELL_CLASS, COUNT_HEAD_CLASS, countText, fillKind } from '../checklist/instance/fillCount';
import { ApiError } from '../../api/http';
import { useAuth } from '../../context/AuthContext';
import { useDepartmentsQuery, useStoresQuery } from '../tickets/hook';
import { useOrgToday } from '../checklist/useOrgToday';
import { windowFor } from '../dashboard/scorePeriods';
import { useFillHeatmap } from './useAttention';
import { PersonAttentionSheet } from './PersonAttentionSheet';
import { LevelAvatar } from './AttentionParts';
import { DAY_LOOK, dayMonthOf, pctText, weekdayOf } from './attentionDisplay';
import type { DayState } from '../../api/exceptions';

const LEGEND: DayState[] = ['done', 'partial', 'missed', 'open', 'none'];

type SummaryKey = 'fill' | 'people' | 'perfect' | 'repeat';

export const FillHeatmapPage = () => {
  const { user } = useAuth();
  const orgWide = user?.role === 'ADMIN' || user?.role === 'PC' || user?.role === 'OWNER';
  const today = useOrgToday();
  const [offset, setOffset] = useState(0);
  const [departmentId, setDepartmentId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [query, setQuery] = useState('');
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [view, setView] = useStoredChoice<FillView>('fill-people-view', FILL_VIEWS, 'cards');
  const [filter, setFilter] = useState<FillFilter>('all');
  const [sort, setSort] = useState<FillSort>('low');
  const win = windowFor('month', offset, today);
  const heatmap = useFillHeatmap(win.from, win.to, departmentId, storeId);
  const departments = useDepartmentsQuery(orgWide);
  const stores = useStoresQuery(orgWide);

  const data = heatmap.data;
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = data?.people ?? [];
    return q ? all.filter((p) => p.name.toLowerCase().includes(q) || p.departmentName?.toLowerCase().includes(q)) : all;
  }, [data, query]);

  const filterCounts = useMemo(() => fillFilterCounts(rows), [rows]);
  const shown = useMemo(
    () => sortByScore(rows.filter((p) => matchesFillFilter(p, filter)), (p) => p.fillRate, (p) => p.name, sort),
    [rows, filter, sort],
  );

  const summary = useMemo(() => {
    const people = data?.people ?? [];
    const due = people.reduce((n, p) => n + p.due, 0);
    const missed = people.reduce((n, p) => n + p.missed, 0);
    return {
      fill: due > 0 ? ((due - missed) / due) * 100 : null,
      repeat: people.filter((p) => p.missedStreak >= 2).length,
      perfect: people.filter((p) => p.due > 0 && p.missed === 0).length,
      people: people.length,
    };
  }, [data]);

  const summaryItems = useMemo<StatusFigureItem<SummaryKey>[]>(() => [
    { key: 'fill', kind: fillKind(summary.fill), label: 'Days filled', short: 'Filled', help: 'Days with every checklist filled, out of days due, for everyone shown' },
    { key: 'people', kind: 'total', label: 'People', help: 'People with a daily checklist in this month' },
    { key: 'perfect', kind: 'completed', label: 'Never missed', short: 'Perfect', help: 'People who filled every day that was due' },
    { key: 'repeat', kind: 'late', label: 'People missing 2+ days', short: '2+ days', help: 'People who missed two or more days in a row' },
  ], [summary.fill]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const hasRows = rows.length > 0;
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const th = el.querySelector<HTMLElement>('[data-today="true"]');
    el.scrollLeft = th ? Math.max(0, th.offsetLeft + th.offsetWidth + 72 - el.clientWidth) : 0;
  }, [data?.today, data?.from, hasRows, view]);

  const forbidden = heatmap.error instanceof ApiError && heatmap.error.status === 403;

  const exportRows = (): TableRows => [
    [
      'Person', 'Department', 'Store', ...(data?.days ?? []),
      'Days filled', 'Completion %', 'Questions done', 'Questions due', 'Questions done %',
      'Met deadline (days)', 'Met deadline %', 'Answers right (good/checked)', 'Compliance %',
    ],
    ...rows.map((p) => [
      p.name,
      p.departmentName ?? '',
      p.storeName ?? '',
      ...p.cells.map((c) => (c.total ? `${DAY_LOOK[c.state].label} (${c.done}/${c.total})` : DAY_LOOK[c.state].label)),
      countText(p.due - p.missed, p.due),
      exportPct(p.fillRate),
      p.questionsDone ?? null,
      p.questionsDue ?? null,
      exportPct(p.questionsPct),
      countText(p.runsOnTime, p.runsDue),
      exportPct(p.metDeadlinePct),
      countText(p.answersGood, p.answersChecked),
      exportPct(p.compliancePct),
    ]),
  ];

  const exportTitleLines = exportTitle({
    what: 'Checklist fill by person',
    from: win.from,
    to: win.to,
    period: win.label,
    filters: {
      Department: departments.data?.find((d) => d.id === departmentId)?.name,
      Store: stores.data?.find((st) => st.id === storeId)?.name,
      Search: query.trim() || null,
    },
  });
  const downloadCompletionCsv = () => downloadCsvNow('fill-by-person', exportRows(), exportTitleLines);
  const activeFilterCount = (departmentId ? 1 : 0) + (storeId ? 1 : 0) + (filter !== 'all' ? 1 : 0);

  return (
    <div className="flex w-full flex-col gap-4 pt-2.5 sm:gap-6">
      <PageHeader icon={Grid3x3} title="Checklist Fill" subtitle="Who filled their daily checklists, day by day. Tap a name for their live view." />

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Period and filters${activeFilterCount ? `, ${activeFilterCount} applied` : ''}`}
              className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-border/60 bg-surface px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">{win.label}</span>
              <CountBadge count={activeFilterCount} label={`${activeFilterCount} filters applied`} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-80 max-w-[90vw] flex-col gap-3">
            <PeriodStepper
              label={win.label}
              onPrev={() => setOffset((o) => o - 1)}
              onNext={() => setOffset((o) => Math.min(0, o + 1))}
              nextDisabled={offset >= 0}
              prevLabel="Previous month"
              nextLabel="Next month"
              todayLabel={offset !== 0 ? 'This month' : undefined}
              onToday={offset !== 0 ? () => setOffset(0) : undefined}
            />
            {orgWide && (
              <div className="flex flex-col gap-2">
                <Combobox
                  id="fill-department"
                  label="Department"
                  value={departmentId}
                  onChange={setDepartmentId}
                  isLoading={departments.isPending}
                  placeholder="All departments"
                  emptyOptionLabel="All departments"
                  options={(departments.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
                />
                <Combobox
                  id="fill-store"
                  label="Store"
                  value={storeId}
                  onChange={setStoreId}
                  isLoading={stores.isPending}
                  placeholder="All stores"
                  emptyOptionLabel="All stores"
                  options={(stores.data ?? []).map((s) => ({ value: s.id, label: s.name }))}
                />
              </div>
            )}
            <div className="flex flex-col gap-2 border-t border-border/50 pt-3">
              <SlidingTabs label="Show" value={filter} options={fillFilterOptions(filterCounts)} onChange={setFilter} size="sm" fill="phone" />
              <SelectDropdown aria-label="Sort" label="Sort" value={sort} options={FILL_SORT_OPTIONS} onChange={setSort} />
            </div>
          </PopoverContent>
        </Popover>
        <span className="hidden sm:block sm:flex-1" aria-hidden />
        <div className="flex items-center gap-2">
          <div className="flex-1 sm:w-64 sm:flex-none">
            <Input id="fill-search" icon={Search} placeholder="Search a name" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" aria-label="Search people" />
          </div>
          <ExportMenu
            disabled={!rows.length}
            aria-label="Export the fill chart"
            filename="fill-by-person"
            sheetName="Fill"
            title={exportTitleLines}
            getRows={exportRows}
            className="h-11 rounded-lg shrink-0"
          />
        </div>
      </div>

      {forbidden ? (
        <NoticeBanner tone="neutral" icon={AlertTriangle}>The fill chart is for department heads, PC and Admin.</NoticeBanner>
      ) : heatmap.isError && !data ? (
        <InlineError message="Couldn't load the fill chart." onRetry={() => void heatmap.refetch()} />
      ) : (
        <>
          <StatusFigureStats
            label="Fill summary"
            items={summaryItems}
            counts={{ fill: Math.round(summary.fill ?? 0), people: summary.people, perfect: summary.perfect, repeat: summary.repeat }}
            display={{ fill: pctText(summary.fill) }}
            isLoading={heatmap.isPending}
          />
          <section aria-label="People" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="t-section font-display font-bold text-text">{view === 'cards' ? 'People' : 'Day by day'}</h2>
              <SlidingTabs label="View" value={view} options={FILL_VIEW_OPTIONS} onChange={setView} size="sm" />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Legend">
                {LEGEND.map((s) => (
                  <li key={s} className="flex items-center gap-1.5 t-meta font-medium text-text-muted">
                    <span className={cn('size-3 rounded', DAY_LOOK[s].cell)} aria-hidden />
                    {DAY_LOOK[s].label}
                  </li>
                ))}
              </ul>
            </div>

            {heatmap.isPending ? (
              <div className="flex flex-col gap-2" role="status" aria-label="Loading">
                {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState size="compact" icon={Grid3x3} title={query ? 'Nobody matches' : 'No daily checklists in this month'} description={query ? 'Try another name.' : 'Pick another month or check who the daily checklists are assigned to.'} />
            ) : shown.length === 0 ? (
              <EmptyState size="compact" icon={Trophy} title="Nobody here" description="Try another filter." action={{ label: 'Show everyone', onClick: () => setFilter('all') }} />
            ) : view === 'cards' ? (
              <FillPeopleCards people={shown} today={data!.today} onOpen={setOpenPerson} />
            ) : (
              <div ref={scrollerRef} className={cn('relative max-h-[min(72svh,56rem)] overflow-auto overscroll-x-contain rounded-2xl border border-border/60 bg-surface custom-scrollbar transition-opacity duration-200', heatmap.isFetching && 'opacity-80')}>
                <table className="w-max min-w-full border-collapse">
                  <caption className="sr-only">Checklist fill by person, {win.label}</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="sticky left-0 top-0 z-30 border-b border-border/60 bg-surface px-3 py-2 text-left t-meta font-display font-semibold text-text-secondary">Person</th>
                      {data!.days.map((d) => (
                        <th key={d} scope="col" data-today={d === data!.today} className={cn('sticky top-0 z-20 w-7 min-w-7 border-b border-border/60 bg-surface px-0.5 py-2 text-center', d === data!.today && 'bg-[color-mix(in_oklab,var(--color-primary-500)_10%,var(--color-surface))]')}>
                          <span className="flex flex-col items-center leading-tight">
                            <span className="t-meta font-semibold tabular-nums text-text-secondary">{Number(d.slice(8))}</span>
                            <span className="t-meta text-text-muted">{weekdayOf(d).slice(0, 1)}</span>
                          </span>
                        </th>
                      ))}
                      <th scope="col" className={cn(COUNT_HEAD_CLASS, 'sticky top-0 z-20 border-b border-border/60 bg-surface p-0')}>
                        <button
                          type="button"
                          onClick={downloadCompletionCsv}
                          title="Days with every checklist filled out of days due. Click to download as CSV"
                          className="group flex h-full w-full cursor-pointer items-center justify-end gap-1 px-3 py-2.5 outline-none transition-colors duration-150 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40 dark:hover:text-primary-300"
                        >
                          Completion
                          <Download className="size-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden="true" />
                        </button>
                      </th>
                      <th scope="col" className={cn(COUNT_HEAD_CLASS, 'sticky top-0 z-20 border-l border-b border-border/60 bg-surface')} title="Good answers out of checked answers they gave. Critical questions count twice. Separated out: it measures accuracy, not fill">Compliance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {shown.map((p) => (
                      <tr key={p.userId} className="group transition-colors duration-150 hover:bg-surface-hover/40">
                        <th scope="row" className="sticky left-0 z-10 bg-surface px-2 py-1.5 text-left font-normal transition-colors duration-150 group-hover:bg-surface-hover">
                          <button
                            type="button"
                            onClick={() => setOpenPerson(p.userId)}
                            className="flex min-h-11 w-40 sm:w-56 items-center gap-2 rounded-lg px-1 text-left outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
                          >
                            <LevelAvatar name={p.name} src={p.avatarUrl} level={p.missedStreak >= 2 ? 'red' : null} size="sm" />
                            <span className="flex min-w-0 flex-col">
                              <span className="line-clamp-2 leading-snug break-words t-card font-display font-semibold text-text">{p.name}</span>
                              {p.missedStreak >= 2 ? (
                                <span className="line-clamp-1 t-meta font-medium text-danger">Missed {p.missedStreak} days running</span>
                              ) : (p.departmentName || p.storeName) ? (
                                <span className="line-clamp-1 t-meta text-text-muted">{[p.departmentName, p.storeName].filter(Boolean).join(', ')}</span>
                              ) : null}
                            </span>
                          </button>
                        </th>
                        {p.cells.map((c) => (
                          <td key={c.date} className={cn('px-0.5 py-1.5 text-center', c.date === data!.today && 'bg-primary-500/10')}>
                            <span
                              title={`${dayMonthOf(c.date)}: ${DAY_LOOK[c.state].label}${c.total ? ` (${c.done} of ${c.total})` : ''}`}
                              className={cn('mx-auto flex size-5 sm:size-6 items-center justify-center rounded-md', DAY_LOOK[c.state].cell)}
                            >
                              {DAY_LOOK[c.state].glyph && (() => { const G = DAY_LOOK[c.state].glyph!; return <G className="size-3" strokeWidth={3} aria-hidden />; })()}
                            </span>
                            <span className="sr-only">{`${dayMonthOf(c.date)} ${DAY_LOOK[c.state].label}`}</span>
                          </td>
                        ))}
                        <td className={cn(COUNT_CELL_CLASS, 'p-0')}>
                          <button
                            type="button"
                            onClick={downloadCompletionCsv}
                            title={`Download ${p.name}'s fill as CSV`}
                            aria-label={`Download the fill chart as CSV`}
                            className="flex w-full cursor-pointer justify-end rounded-lg px-3 py-2.5 outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/40"
                          >
                            <FillCountCell done={p.due - p.missed} due={p.due} pct={p.fillRate} unit={p.due === 1 ? 'day' : 'days'} />
                          </button>
                        </td>
                        <td className={cn(COUNT_CELL_CLASS, 'border-l border-border/60')}>
                          <FillCountCell done={p.answersGood} due={p.answersChecked} pct={p.compliancePct} emptyTitle="No answers of theirs were checked in this month" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <PersonAttentionSheet userId={openPerson} onClose={() => setOpenPerson(null)} />
    </div>
  );
};

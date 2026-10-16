import { useState } from 'react';
import { AlarmClock, Building2, CalendarClock, CalendarPlus, Clock, History, Layers, ShieldAlert, ShieldCheck, Store, Search, User, X, ArrowUpDown } from 'lucide-react';
import { Combobox } from '../../components';
import { OptionsSheet, OptionSection, OptionSelect, OptionSegmented, ChoiceChip, ChoiceIcon, ChoiceWrap, ChoiceClear } from '../../components/optionsSheet';
import { cn } from '@/lib/utils';
import { PeriodTabControl } from '../dashboard/PeriodTabControl';
import type { QueueLookups } from './useChecklistQueue';
import type { QueueParams, QueueParamsPatch } from './useQueueParams';
import { AGE_OPTIONS, SORT_OPTIONS, UNASSIGNED, type AgeFilter, type QueueTab, type QueueView, type SortKey } from './verificationModel';

interface QueueToolbarProps {
  params: QueueParams;
  patch: (change: QueueParamsPatch, options?: { replace?: boolean }) => void;
  lookups: QueueLookups;
  /** "Needs attention only" is about checklists, so it is off on the Tickets and Delegations tabs. */
  attentionAvailable: boolean;
  filtersActive: boolean;
  onClear: () => void;
  /** How many items the current filters leave, for the sheet's "Show N" button. */
  shownCount?: number | null;
  /** How many are waiting per type, for the Type choices in Options. Null while loading. */
  counts: { all: number; checklists: number; tickets: number; delegations: number } | null;
  /** How many decisions were made today, for the Show choices. Null while loading. */
  decidedCount: number | null;
}

const SORT_LABEL = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o.label])) as Record<SortKey, string>;
const SORT_ICON: Record<SortKey, typeof Clock> = { oldest: Clock, overdue: AlarmClock, compliance: ShieldCheck, newest: CalendarPlus };

const VIEW_OPTIONS: readonly QueueView[] = ['waiting', 'decided'];

const TYPE_LABEL: Record<QueueTab, string> = { all: 'All', checklists: 'Checklists', tickets: 'Tickets', delegations: 'Delegations' };

const AGE_SEGMENTS = AGE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.value === 'any' ? 'Any age' : `${o.value}+ days`,
  icon: o.value === 'any' ? Clock : CalendarClock,
}));

/** One removable chip for an applied filter. */
const AppliedChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="flex items-center gap-1 h-8 pl-3 pr-1 rounded-full border border-border/60 bg-surface t-meta font-display font-semibold text-text">
    <span className="truncate max-w-[12rem]">{label}</span>
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className="relative flex items-center justify-center size-6 shrink-0 rounded-full text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5"
    >
      <X size={13} aria-hidden />
    </button>
  </span>
);

// Search, plus ONE Options button that holds everything else (sort, store, department, person, age,
// needs attention). What is applied shows as chips under the search box, each one removable.
// Everything is written to the URL.
export const QueueToolbar = ({ params, patch, lookups, attentionAvailable, filtersActive, onClear, shownCount, counts, decidedCount }: QueueToolbarProps) => {
  const [open, setOpen] = useState(false);
  const decided = params.view === 'decided';

  const attention = params.attention && attentionAvailable;
  const storeName = params.store ? lookups.stores.find((s) => s.id === params.store)?.name ?? 'Store' : null;
  const deptName = params.dept ? (params.dept === UNASSIGNED ? 'No department' : lookups.departments.find((d) => d.id === params.dept)?.name ?? 'Department') : null;
  const personName = params.person ? lookups.people.find((p) => p.id === params.person)?.name ?? 'Person' : null;
  const ageLabel = params.age !== 'any' ? AGE_SEGMENTS.find((a) => a.value === params.age)?.label ?? null : null;

  const activeCount = (decided ? 1 : 0) + (!decided && params.tab !== 'all' ? 1 : 0) + (params.store ? 1 : 0) + (params.dept ? 1 : 0) + (params.person ? 1 : 0) + (params.age !== 'any' ? 1 : 0) + (attention ? 1 : 0);
  const showLabel = shownCount == null ? 'Show results' : `Show ${shownCount} ${shownCount === 1 ? 'item' : 'items'}`;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {!decided && (
        <label className="relative flex-1 min-w-0 sm:max-w-sm">
          <span className="sr-only">Search by title, person or store</span>
          <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light pointer-events-none" />
          <input
            type="search"
            value={params.q}
            onChange={(e) => patch({ q: e.target.value })}
            placeholder="Search name or store"
            className={cn(
              'w-full h-11 sm:h-9 pl-9 pr-9 rounded-lg border border-border bg-surface-hover text-sm font-display text-text placeholder:text-text-light',
              'transition-colors duration-200 outline-none hover:border-border-hover focus:bg-surface focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30',
              '[&::-webkit-search-cancel-button]:appearance-none',
            )}
          />
          {params.q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => patch({ q: '' })}
              className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center size-11 sm:size-9 rounded-lg text-text-muted hover:text-text transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </label>
        )}

        <OptionsSheet
          isOpen={open}
          setIsOpen={setOpen}
          activeCount={activeCount}
          subtitle={decided ? "Today's decisions" : filtersActive ? 'Showing a narrowed view' : 'Everything waiting for you'}
          onReset={() => { onClear(); patch({ sort: 'oldest', tab: 'all', view: 'waiting', open: null }); }}
          canReset={filtersActive || params.sort !== 'oldest' || params.tab !== 'all' || decided}
          showLabel={decided ? 'Show decisions' : showLabel}
        >
          {/* What was the two tab strips on the page: whether to look at the work waiting or at what was
              decided today, and which kind of work. Everything about the view now lives in this one place. */}
          <OptionSection icon={History} label="Show">
            <PeriodTabControl
              value={params.view}
              options={VIEW_OPTIONS}
              labels={{
                waiting: `Waiting${counts ? ` ${counts.all}` : ''}`,
                decided: `Decided today${decidedCount != null ? ` ${decidedCount}` : ''}`,
              }}
              onChange={(view) => patch({ view, open: null }, { replace: false })}
              fill
            />
          </OptionSection>

          {!decided && (
            <OptionSection icon={Layers} label="Type">
              {/* Wrapping choices, not a four-across strip: "Delegations 12" does not fit a quarter of a phone. */}
              <ChoiceWrap>
                {(Object.keys(TYPE_LABEL) as QueueTab[]).map((tab) => (
                  <ChoiceChip key={tab} active={params.tab === tab} onClick={() => patch({ tab, open: null })}>
                    {TYPE_LABEL[tab]}{counts ? ` ${counts[tab]}` : ''}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>
          )}

          {!decided && (<>
          <OptionSection icon={ArrowUpDown} label="Sort by">
            <OptionSelect labels={SORT_LABEL} icons={SORT_ICON} value={params.sort} onChange={(sort) => patch({ sort })} />
          </OptionSection>

          <OptionSection icon={Clock} label="How long waiting">
            <OptionSegmented
              options={AGE_SEGMENTS}
              value={params.age}
              onChange={(age: AgeFilter) => patch({ age })}
            />
          </OptionSection>

          {lookups.stores.length > 0 && (
            <OptionSection icon={Store} label="Store" aside={params.store ? <ChoiceClear onClick={() => patch({ store: null })} /> : undefined}>
              <ChoiceWrap>
                {lookups.stores.map((s) => (
                  <ChoiceChip
                    key={s.id}
                    active={params.store === s.id}
                    onClick={() => patch({ store: params.store === s.id ? null : s.id })}
                    lead={<ChoiceIcon icon={Store} tone="bg-primary-600" />}
                  >
                    {s.name}
                  </ChoiceChip>
                ))}
              </ChoiceWrap>
            </OptionSection>
          )}

          <OptionSection icon={Building2} label="Department" aside={params.dept ? <ChoiceClear onClick={() => patch({ dept: null })} /> : undefined}>
            <ChoiceWrap>
              {lookups.departments.map((d) => (
                <ChoiceChip
                  key={d.id}
                  active={params.dept === d.id}
                  onClick={() => patch({ dept: params.dept === d.id ? null : d.id })}
                  lead={<ChoiceIcon icon={Building2} tone="bg-primary-600" />}
                >
                  {d.name}
                </ChoiceChip>
              ))}
              <ChoiceChip
                active={params.dept === UNASSIGNED}
                onClick={() => patch({ dept: params.dept === UNASSIGNED ? null : UNASSIGNED })}
              >
                No department
              </ChoiceChip>
            </ChoiceWrap>
          </OptionSection>

          <OptionSection icon={User} label="Person" aside={params.person ? <ChoiceClear onClick={() => patch({ person: null })} /> : undefined}>
            <Combobox
              value={params.person ?? ''}
              onChange={(v) => patch({ person: v || null })}
              options={lookups.people.map((p) => ({ value: p.id, label: p.name }))}
              emptyOptionLabel="All people"
              placeholder="Search people..."
            />
          </OptionSection>

          <OptionSection icon={ShieldAlert} label="Checklists">
            <ChoiceWrap>
              <ChoiceChip
                active={attention}
                onClick={() => attentionAvailable && patch({ attention: !params.attention })}
                lead={<ChoiceIcon icon={ShieldAlert} tone="bg-warning" />}
              >
                Needs attention only
              </ChoiceChip>
            </ChoiceWrap>
            {!attentionAvailable && (
              <p className="t-meta font-display text-text-muted">Only applies to checklists. Switch the Type to All or Checklists to use it.</p>
            )}
          </OptionSection>
          </>)}
        </OptionsSheet>
      </div>

      {(filtersActive || decided || (!decided && params.tab !== 'all')) && (
        <div className="flex flex-wrap items-center gap-2">
          {decided && <AppliedChip label="Decided today" onRemove={() => patch({ view: 'waiting' }, { replace: false })} />}
          {!decided && params.tab !== 'all' && <AppliedChip label={TYPE_LABEL[params.tab]} onRemove={() => patch({ tab: 'all', open: null })} />}
          {storeName && <AppliedChip label={storeName} onRemove={() => patch({ store: null })} />}
          {deptName && <AppliedChip label={deptName} onRemove={() => patch({ dept: null })} />}
          {personName && <AppliedChip label={personName} onRemove={() => patch({ person: null })} />}
          {ageLabel && <AppliedChip label={ageLabel} onRemove={() => patch({ age: 'any' })} />}
          {attention && <AppliedChip label="Needs attention" onRemove={() => patch({ attention: false })} />}
          {params.q.trim() && <AppliedChip label={`Search: ${params.q.trim()}`} onRemove={() => patch({ q: '' })} />}
          <button
            type="button"
            onClick={onClear}
            className="h-8 px-2.5 pointer-coarse:h-11 pointer-coarse:px-3 rounded-lg t-meta font-display font-medium text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};

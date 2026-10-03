import { Search, X, ShieldAlert } from 'lucide-react';
import { Button, ToggleChip } from '../../components';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select';
import { cn } from '@/lib/utils';
import type { QueueLookups } from './useChecklistQueue';
import type { QueueParams, QueueParamsPatch } from './useQueueParams';
import { AGE_OPTIONS, ALL, SORT_OPTIONS, UNASSIGNED, type AgeFilter, type SortKey } from './verificationModel';

const TRIGGER = 'w-full sm:w-auto sm:min-w-[8.5rem] pointer-coarse:data-[size=sm]:h-11';

interface QueueToolbarProps {
  params: QueueParams;
  patch: (change: QueueParamsPatch) => void;
  lookups: QueueLookups;
  /** "Needs attention only" is about checklists, so it is off on the Tickets and Delegations tabs. */
  attentionAvailable: boolean;
  filtersActive: boolean;
  onClear: () => void;
}

// Search, sort and the Store / Department / Person / Age filters. Everything is written to the URL.
export const QueueToolbar = ({ params, patch, lookups, attentionAvailable, filtersActive, onClear }: QueueToolbarProps) => (
  <div className="flex flex-col gap-3">
    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
      <label className="relative flex-1 min-w-0 sm:max-w-sm">
        <span className="sr-only">Search by title, person or store</span>
        <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light pointer-events-none" />
        <input
          type="search"
          value={params.q}
          onChange={(e) => patch({ q: e.target.value })}
          placeholder="Search title, person or store"
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

      <Select value={params.sort} onValueChange={(v) => patch({ sort: v as SortKey })}>
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Sort checklists">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>

    <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-2">
      <Select value={params.store ?? ALL} onValueChange={(v) => patch({ store: v === ALL ? null : v })}>
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Filter by store">
          <SelectValue placeholder="All stores" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All stores</SelectItem>
          {lookups.stores.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={params.dept ?? ALL} onValueChange={(v) => patch({ dept: v === ALL ? null : v })}>
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Filter by department">
          <SelectValue placeholder="All departments" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All departments</SelectItem>
          {lookups.departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          <SelectItem value={UNASSIGNED}>No department</SelectItem>
        </SelectContent>
      </Select>

      <Select value={params.person ?? ALL} onValueChange={(v) => patch({ person: v === ALL ? null : v })}>
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Filter by person">
          <SelectValue placeholder="All people" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All people</SelectItem>
          {lookups.people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={params.age} onValueChange={(v) => patch({ age: v as AgeFilter })}>
        <SelectTrigger size="sm" className={TRIGGER} aria-label="Filter by age">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <ToggleChip
        on={params.attention && attentionAvailable}
        disabled={!attentionAvailable}
        onClick={() => patch({ attention: !params.attention })}
        className="col-span-2 sm:col-span-1 justify-center"
      >
        <ShieldAlert size={13} aria-hidden />
        Needs attention only
      </ToggleChip>

      {filtersActive && (
        <Button size="sm" variant="ghost" className="col-span-2 sm:col-span-1" onClick={onClear}>
          <X size={13} aria-hidden />
          Clear filters
        </Button>
      )}
    </div>
  </div>
);

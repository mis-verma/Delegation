import { useMemo, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, Search, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ListOption {
  value: string;
  label: string;
  /** Small secondary text on the right (a department, a code). It is searched too. */
  hint?: string;
  /** Leading visual: an avatar, a coloured icon tile. */
  lead?: ReactNode;
}

export interface ListAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Quiet by default; `primary` is for the add/create row. */
  tone?: 'default' | 'primary';
}

interface OptionListProps {
  options: ListOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** Square tick boxes and the list stays open between picks; otherwise a single tick. */
  multiple?: boolean;
  /** Show the search box. Defaults to on for long lists (more than 7 rows). */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
  isLoading?: boolean;
  /** Rows that act instead of pick ("Create new"), after the list. */
  actions?: ListAction[];
  /** Rows that act instead of pick, above the list ("Unassigned"). */
  topActions?: ListAction[];
}

// Past this many rows only the first batch is drawn until the search narrows the list.
const MAX_ROWS = 80;
const SEARCH_THRESHOLD = 7;

const highlight = (label: string, query: string): ReactNode => {
  if (!query) return label;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <mark className="font-bold rounded-sm px-0.5 bg-primary-600 text-white">{label.slice(idx, idx + query.length)}</mark>
      {label.slice(idx + query.length)}
    </>
  );
};

const ActionRow = ({ action }: { action: ListAction }) => {
  const Icon = action.icon;
  return (
    <button
      type="button"
      onClick={action.onSelect}
      className={cn(
        'flex items-center gap-3 w-full min-h-12 px-3 rounded-xl text-left text-sm font-display font-semibold cursor-pointer outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
        action.tone === 'primary'
          ? 'text-primary-700 dark:text-primary-300 hover:bg-primary-500/10 active:bg-primary-500/10'
          : 'text-text-muted hover:bg-surface-hover active:bg-surface-hover',
      )}
    >
      {Icon && <Icon size={16} className="shrink-0" aria-hidden />}
      <span className="truncate">{action.label}</span>
    </button>
  );
};

/**
 * The list inside a selector's phone sheet: 48px rows a thumb can hit, a search box once the list is
 * long, a clear tick for what is chosen, and room for a lead (avatar or icon) and a hint per row.
 * One component for single and multiple choice so every selector in the app reads the same.
 */
export const OptionList = ({
  options, selected, onToggle, multiple = false, searchable, searchPlaceholder = 'Search…', emptyText = 'No options', isLoading = false, actions, topActions,
}: OptionListProps) => {
  const [query, setQuery] = useState('');
  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;
  const needle = query.trim().toLowerCase();

  const filtered = useMemo(
    () => (needle ? options.filter((o) => `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(needle)) : options),
    [options, needle],
  );
  const shown = filtered.length > MAX_ROWS ? filtered.slice(0, MAX_ROWS) : filtered;
  const hidden = filtered.length - shown.length;

  return (
    <div className="flex flex-col gap-2 min-h-0">
      {showSearch && (
        <div className="relative shrink-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light pointer-events-none" aria-hidden />
          {/* 16px on a phone: smaller makes iOS zoom the whole page when the field is focused. */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            autoComplete="off"
            enterKeyHint="search"
            className="w-full h-11 rounded-xl border border-border bg-background pl-9 pr-3 text-base text-text placeholder:text-text-light outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
          />
        </div>
      )}

      {topActions?.map((a) => <ActionRow key={a.key} action={a} />)}

      <ul role="listbox" aria-multiselectable={multiple || undefined} className="flex flex-col gap-0.5">
        {isLoading ? (
          <li className="px-3 py-3 text-sm font-display text-text-muted">Loading…</li>
        ) : shown.length === 0 ? (
          <li className="flex items-center gap-2 px-3 py-3 text-sm font-display text-text-muted">
            <SearchX size={15} className="shrink-0 text-text-light" aria-hidden />
            <span className="truncate">{needle ? `No matches for "${query.trim()}"` : emptyText}</span>
          </li>
        ) : (
          shown.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <li key={option.value || '__empty__'} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => onToggle(option.value)}
                  className={cn(
                    'flex items-center gap-3 w-full min-h-12 px-3 py-2 rounded-xl text-left text-sm font-display font-medium cursor-pointer outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
                    isSelected
                      ? 'bg-gradient-to-r from-primary-500/15 to-primary-500/5 text-primary-800 dark:text-primary-200 font-semibold'
                      : 'text-text hover:bg-primary-500/8 active:bg-primary-500/10',
                    !option.value && !isSelected && 'text-text-muted italic',
                  )}
                >
                  {option.lead}
                  <span className="flex-1 min-w-0 truncate">{highlight(option.label, query.trim())}</span>
                  {option.hint && <span className="shrink-0 max-w-28 truncate text-xs font-medium text-text-muted">{option.hint}</span>}
                  {multiple ? (
                    <span
                      aria-hidden
                      className={cn(
                        'flex items-center justify-center size-5 rounded-[5px] border shrink-0 transition-colors duration-150',
                        isSelected ? 'bg-gradient-to-br from-primary-500 to-primary-700 border-transparent text-white' : 'border-border-hover text-transparent',
                      )}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                  ) : (
                    isSelected && (
                      <span className="flex items-center justify-center size-5 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white shrink-0" aria-hidden>
                        <Check size={12} strokeWidth={3.5} />
                      </span>
                    )
                  )}
                </button>
              </li>
            );
          })
        )}
        {hidden > 0 && <li aria-hidden className="px-3 py-2 text-xs font-display text-text-muted text-center">{hidden} more. Type to narrow the list.</li>}
      </ul>

      {actions?.map((a) => <ActionRow key={a.key} action={a} />)}
    </div>
  );
};

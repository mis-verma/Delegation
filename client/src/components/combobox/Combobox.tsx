import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, CornerDownLeft, Plus, Search, SearchX, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader } from '../loaders/Loader';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { PickerShell } from '../dateTime/PickerShell';
import { OptionList } from '../dropdown/OptionList';
import { buildSearchIndex, filterOptions, matchedKeyword, searchTerms } from '../dropdown/optionFilter';
import { highlightTerms } from '../dropdown/highlightTerms';
import { useMediaQuery } from '../../lib/useMediaQuery';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
  keywords?: readonly string[];
  lead?: ReactNode;
}

const MAX_ROWS = 60;
const MARK_CLASS = 'rounded-[3px] bg-primary-500/20 px-0.5 font-bold text-primary-800 dark:bg-primary-400/25 dark:text-primary-100';

interface ComboboxProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  emptyOptionLabel?: string;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  onCreateNew?: (query: string) => void;
  createNewLabel?: string;
  label?: string;
  searchPlaceholder?: string;
}

export const Combobox = ({
  id,
  value,
  onChange,
  options,
  placeholder = 'Search...',
  emptyOptionLabel,
  isLoading,
  disabled,
  className,
  onCreateNew,
  createNewLabel = 'Create new',
  label,
  searchPlaceholder,
}: ComboboxProps) => {
  const isPhone = useMediaQuery('(max-width: 639px)');
  const allOptions = useMemo<ComboboxOption[]>(
    () => (emptyOptionLabel !== undefined ? [{ value: '', label: emptyOptionLabel }, ...options] : options),
    [options, emptyOptionLabel]
  );
  const selected = allOptions.find((o) => o.value === value);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [triggerEl, setTriggerEl] = useState<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;
  const trimmedQuery = query.trim();
  const index = useMemo(() => buildSearchIndex(allOptions), [allOptions]);
  const filtered = useMemo(() => filterOptions(allOptions, query, index), [allOptions, query, index]);
  const shown = useMemo(() => {
    if (filtered.length <= MAX_ROWS) return filtered;
    const head = filtered.slice(0, MAX_ROWS);
    const current = filtered.find((o) => o.value === value);
    return current && !head.includes(current) ? [current, ...head.slice(0, MAX_ROWS - 1)] : head;
  }, [filtered, value]);
  const hiddenCount = filtered.length - shown.length;
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(shown.length - 1, 0));

  const hasExactMatch = trimmedQuery
    ? allOptions.some((o) => o.label.trim().toLowerCase() === trimmedQuery.toLowerCase())
    : false;

  const optionId = useCallback((option: ComboboxOption) =>
    `${id ?? 'combobox'}-option-${option.value ? option.value : '__empty__'}`, [id]);

  const commit = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const clearQuery = () => {
    setQuery('');
    setHighlightedIndex(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(Math.min(safeHighlightedIndex + 1, shown.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(Math.max(safeHighlightedIndex - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHighlightedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHighlightedIndex(Math.max(shown.length - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = shown[safeHighlightedIndex];
      if (option) commit(option);
      else if (onCreateNew && trimmedQuery) {
        onCreateNew(trimmedQuery);
        setOpen(false);
      }
    } else if (e.key === 'Escape' && query) {
      e.preventDefault();
      e.stopPropagation();
      clearQuery();
    }
  };

  useEffect(() => {
    if (!open) return;
    const active = shown[safeHighlightedIndex];
    const row = active ? listRef.current?.querySelector<HTMLElement>(`[id="${optionId(active)}"]`) : null;
    row?.scrollIntoView({ block: 'nearest' });
  }, [open, safeHighlightedIndex, shown, optionId]);

  const triggerButton = (
    <button
      ref={setTriggerEl}
      type="button"
      id={id}
      disabled={disabled || isLoading}
      aria-expanded={open}
      className={cn(
        'press-feedback flex items-center gap-2 w-full min-h-10 pointer-coarse:min-h-11 py-1 pl-3 pr-2 rounded-xl border bg-surface text-sm transition-colors cursor-pointer',
        'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/15 focus-visible:border-primary-400',
        'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border',
        open ? 'border-primary-500' : 'border-border/70 hover:border-primary-400/70',
        className,
      )}
    >
      {!isLoading && selected?.value && selected.lead}
      <span className={cn('flex-1 min-w-0 text-left line-clamp-2 break-words leading-snug', selected?.label ? 'text-text font-medium' : 'text-text-muted font-medium')}>
        {isLoading ? 'Loading...' : (selected?.label || placeholder)}
      </span>
      {isLoading ? (
        <Loader size="sm" variant="slate" className="w-3.5 h-3.5 shrink-0" />
      ) : (
        <span className={cn('flex items-center justify-center size-6 rounded-full shrink-0 transition-colors duration-200', open ? 'bg-primary-500/15 text-primary-700 dark:text-primary-300' : 'bg-surface-hover text-text-light')}>
          <ChevronDown size={14} strokeWidth={2.4} className={cn('transition-transform duration-200', open && 'rotate-180')} />
        </span>
      )}
    </button>
  );

  const fieldName = label
    ?? (placeholder.replace(/^Search\s+/i, '').replace(/[….]+$/, '').trim().replace(/^./, (c) => c.toUpperCase()) || 'Choose an option');
  const typePlaceholder = searchPlaceholder ?? 'Type to search…';

  if (isPhone) {
    return (
      <PickerShell
        bare
        open={open}
        onOpenChange={(next) => {
          if (next && (disabled || isLoading)) return;
          setOpen(next);
        }}
        trigger={triggerButton}
        title={fieldName}
      >
        <OptionList
          options={allOptions}
          selected={[value]}
          onToggle={(v) => { onChange(v); setOpen(false); }}
          searchable={allOptions.length > 5 || allOptions.some((o) => !!o.keywords?.length)}
          searchPlaceholder={typePlaceholder}
          topActions={onCreateNew ? [{
            key: 'create',
            label: createNewLabel,
            icon: Plus,
            tone: 'primary' as const,
            onSelect: () => { onCreateNew(''); setOpen(false); },
          }] : undefined}
        />
      </PickerShell>
    );
  }

  return (
    <Popover
      open={open}
      modal
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setQuery('');
          const currentIndex = allOptions.findIndex((o) => o.value === value);
          setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0);
        }
      }}
    >
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>

      <PopoverContent
        collisionBoundary={triggerEl?.closest('[data-slot="dialog-content"]') ?? undefined}
        collisionPadding={16}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
        className="w-(--radix-popover-trigger-width) min-w-64 max-h-[min(24rem,var(--radix-popover-content-available-height))] flex flex-col p-2"
      >
        <div className="relative shrink-0">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-light" aria-hidden />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={open}
            aria-label={`Search ${fieldName.toLowerCase()}`}
            aria-controls={id ? `${id}-listbox` : undefined}
            aria-activedescendant={shown[safeHighlightedIndex] ? optionId(shown[safeHighlightedIndex]) : undefined}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            placeholder={typePlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="h-10 w-full rounded-lg border border-border bg-background pl-8 pr-9 text-sm text-text placeholder:text-text-light focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-400/30 pointer-fine:h-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear the search"
              onMouseDown={(e) => e.preventDefault()}
              onClick={clearQuery}
              className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-text-light outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>

        {searching && filtered.length > 0 && (
          <p aria-live="polite" className="shrink-0 px-1 pt-1.5 t-meta font-display text-text-muted">
            {filtered.length} of {allOptions.length}
          </p>
        )}

        <ul ref={listRef} id={id ? `${id}-listbox` : undefined} role="listbox" className="mt-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {filtered.length === 0 ? (
            <li className="flex flex-col items-center gap-1 px-3 py-6 text-center">
              <SearchX size={18} className="text-text-light" aria-hidden />
              <span className="text-sm font-display font-semibold text-text-secondary">
                {trimmedQuery ? `No match for "${trimmedQuery}"` : 'Nothing to choose from'}
              </span>
              {trimmedQuery && <span className="t-meta text-text-muted">Try a shorter word, or fewer words.</span>}
            </li>
          ) : (
            shown.map((option, i) => {
              const isSelected = option.value === value;
              const isHighlighted = i === safeHighlightedIndex;
              const via = matchedKeyword(option, terms);
              return (
                <Fragment key={option.value || '__empty__'}>
                  {option.group && option.group !== shown[i - 1]?.group && (
                    <li role="presentation" className={cn('sticky top-0 z-10 bg-surface px-3 pt-2.5 pb-1 t-meta font-display font-bold text-text-secondary', i > 0 && 'mt-1 border-t border-border/50')}>{option.group}</li>
                  )}
                <li
                  id={optionId(option)}
                  role="option"
                  aria-selected={isSelected}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    commit(option);
                  }}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 min-h-10 pointer-coarse:min-h-11 rounded-lg text-sm leading-snug font-display font-medium cursor-pointer transition-colors duration-150',
                    isSelected
                      ? 'bg-primary-500/12 text-primary-800 dark:text-primary-200 font-semibold'
                      : isHighlighted
                        ? 'bg-surface-hover text-text'
                        : 'text-text hover:bg-surface-hover',
                    !option.value && !isSelected && 'text-text-muted italic',
                    option.group && 'pl-5'
                  )}
                >
                  {option.lead}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2 break-words" title={option.label}>{highlightTerms(option.label, terms, MARK_CLASS)}</span>
                    {via && (
                      <span className="t-meta font-normal text-text-muted line-clamp-1 break-words">
                        has {highlightTerms(via, terms, MARK_CLASS)}
                      </span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {option.hint && <span className="whitespace-nowrap rounded-md bg-surface-hover px-1.5 py-0.5 t-meta font-semibold tabular-nums text-text-secondary">{option.hint}</span>}
                    {isSelected ? (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-800 text-white">
                        <Check size={10} strokeWidth={3.5} />
                      </span>
                    ) : isHighlighted ? (
                      <CornerDownLeft size={13} className="shrink-0 text-text-light" aria-hidden />
                    ) : null}
                  </span>
                </li>
                </Fragment>
              );
            })
          )}

          {hiddenCount > 0 && (
            <li aria-hidden="true" className="px-3 py-2 t-meta font-display text-text-muted text-center">
              {hiddenCount} more. Type to narrow the list.
            </li>
          )}

          {onCreateNew && !hasExactMatch && (
            <li
              role="option"
              aria-selected={false}
              onMouseDown={(e) => {
                e.preventDefault();
                onCreateNew(trimmedQuery);
                setOpen(false);
              }}
              className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border-t border-border px-3 py-2.5 pt-3 text-sm font-display font-medium text-primary-600 transition-colors duration-150 hover:bg-primary-500/10 dark:text-primary-400"
            >
              <Plus size={14} className="shrink-0" />
              <span className="truncate">
                {trimmedQuery ? `${createNewLabel} "${trimmedQuery}"` : createNewLabel}
              </span>
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

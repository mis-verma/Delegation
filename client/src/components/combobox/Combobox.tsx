import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronDown, Plus, Search, SearchX } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader } from '../loaders/Loader';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface ComboboxOption {
  value: string;
  label: string;
}

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
}

const highlightMatch = (label: string, query: string, isActive: boolean): ReactNode => {
  if (!query) return label;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <mark className={cn('font-bold rounded-sm px-0.5', isActive ? 'bg-white/25 text-white' : 'bg-primary-600 text-white')}>
        {label.slice(idx, idx + query.length)}
      </mark>
      {label.slice(idx + query.length)}
    </>
  );
};

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
}: ComboboxProps) => {
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

  const trimmedQuery = query.trim();
  const filtered = useMemo(
    () => (trimmedQuery ? allOptions.filter((o) => o.label.toLowerCase().includes(trimmedQuery.toLowerCase())) : allOptions),
    [allOptions, trimmedQuery]
  );
  const safeHighlightedIndex = Math.min(highlightedIndex, Math.max(filtered.length - 1, 0));

  const hasExactMatch = trimmedQuery
    ? allOptions.some((o) => o.label.trim().toLowerCase() === trimmedQuery.toLowerCase())
    : false;

  const optionId = (option: ComboboxOption) =>
    `${id ?? 'combobox'}-option-${option.value ? option.value : '__empty__'}`;

  const commit = (option: ComboboxOption) => {
    onChange(option.value);
    setOpen(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(Math.min(safeHighlightedIndex + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(Math.max(safeHighlightedIndex - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const option = filtered[safeHighlightedIndex];
      if (option) commit(option);
    }
  };

  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.children[safeHighlightedIndex] as HTMLElement | undefined;
    row?.scrollIntoView({ block: 'nearest' });
  }, [open]);

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
      <PopoverTrigger asChild>
        <button
          ref={setTriggerEl}
          type="button"
          id={id}
          disabled={disabled || isLoading}
          aria-expanded={open}
          className={cn(
            'press-feedback flex items-center gap-2 w-full h-10 px-3 rounded-md border bg-surface text-sm transition-colors cursor-pointer',
            'focus:outline-none focus:ring-2 focus:ring-primary-400',
            'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border',
            open ? 'border-primary-500' : 'border-border hover:border-primary-400',
            className,
          )}
        >
          <Search size={14} className="text-text-light shrink-0" />
          <span className={cn('flex-1 text-left truncate', selected?.label ? 'text-text font-medium' : 'text-text-muted font-medium')}>
            {isLoading ? 'Loading...' : (selected?.label || placeholder)}
          </span>
          {isLoading ? (
            <Loader size="sm" variant="slate" className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <ChevronDown size={14} className={cn('shrink-0 text-text-light transition-transform duration-200', open && 'rotate-180')} />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        collisionBoundary={triggerEl?.closest('[data-slot="dialog-content"]') ?? undefined}
        collisionPadding={16}
       
        className="w-(--radix-popover-trigger-width) max-h-(--radix-popover-content-available-height) flex flex-col p-2"
      >
        <div className="relative mb-1.5 shrink-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-light pointer-events-none" />
          <input
            autoFocus
            role="combobox"
            aria-expanded={open}
            aria-controls={id ? `${id}-listbox` : undefined}
            aria-activedescendant={filtered[safeHighlightedIndex] ? optionId(filtered[safeHighlightedIndex]) : undefined}
            value={query}
            placeholder="Type to search…"
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlightedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            className="w-full h-8 rounded-md border border-border bg-background pl-8 pr-2 text-sm text-text placeholder:text-text-light focus:outline-none focus:ring-2 focus:border-primary-400 focus:ring-primary-400/30"
          />
        </div>

        <ul ref={listRef} id={id ? `${id}-listbox` : undefined} role="listbox" className="flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="flex items-center gap-2 px-3 py-2.5 text-sm font-display text-text-muted">
              <SearchX size={14} className="shrink-0 text-text-light" />
              <span className="truncate">{trimmedQuery ? `No matches for "${trimmedQuery}"` : 'No options'}</span>
            </li>
          ) : (
            filtered.map((option, i) => (
              <li
                key={option.value || '__empty__'}
                id={optionId(option)}
                role="option"
                aria-selected={option.value === value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={cn(
                  'flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-sm font-display font-medium cursor-pointer transition-all duration-200 active:scale-[0.98]',
                  i === safeHighlightedIndex ? 'bg-primary-600 text-white font-semibold' : 'text-text hover:bg-surface-hover',
                  !option.value && 'text-text-muted italic'
                )}
              >
                <span className="truncate">{highlightMatch(option.label, trimmedQuery, i === safeHighlightedIndex)}</span>
                {option.value === value && (
                  <Check size={14} className={cn('shrink-0', i === safeHighlightedIndex ? 'text-white' : 'text-primary-600 dark:text-primary-400')} />
                )}
              </li>
            ))
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
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-display font-medium text-primary-600 dark:text-primary-400 cursor-pointer transition-all duration-200 active:scale-[0.98] hover:bg-primary-500/10 border-t border-border mt-1 pt-3"
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

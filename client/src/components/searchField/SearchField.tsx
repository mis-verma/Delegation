import type { KeyboardEvent } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}

export const SearchField = ({ value, onChange, label, placeholder = 'Search', className }: SearchFieldProps) => {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Escape' || !value) return;
    e.preventDefault();
    e.stopPropagation();
    onChange('');
  };

  return (
    <label className={cn('relative flex-1 min-w-0 sm:max-w-xs', className)}>
      <span className="sr-only">{label}</span>
      <Search size={15} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-text-light pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        className={cn(
          'w-full h-11 sm:h-9 pointer-coarse:h-11 pl-9 pr-11 sm:pr-9 rounded-lg border border-border bg-surface-hover text-sm font-display text-text placeholder:text-text-light',
          'transition-colors duration-200 ease-out outline-none hover:border-border-hover focus:bg-surface focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30',
          '[&::-webkit-search-cancel-button]:appearance-none',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center size-11 sm:size-9 pointer-coarse:size-11 rounded-lg text-text-muted hover:text-text transition-colors duration-150 ease-out cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <X size={14} aria-hidden />
        </button>
      )}
    </label>
  );
};

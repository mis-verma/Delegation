import { Loader2, Check, Store } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useStoresQuery } from '../../features/tickets/hook';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface StoreMultiSelectProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export const StoreMultiSelect = ({ selected, onChange }: StoreMultiSelectProps) => {
  const { data: stores, isLoading } = useStoresQuery();

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  };

  return (
    <div className="flex flex-col gap-1 w-full max-h-56 overflow-y-auto custom-scrollbar p-2 bg-muted/30 border border-border rounded-xl">

      {isLoading && (
        <div className="flex items-center gap-2.5 text-sm font-medium text-text-muted px-3 py-4 animate-pulse">
          <Loader2 size={16} className="animate-spin text-text-light" />
          Loading stores…
        </div>
      )}

      {!isLoading && !stores?.length && (
        <div className="flex flex-col items-center justify-center gap-2 px-3 py-6 text-center">
          <div className="flex items-center justify-center size-10 rounded-full bg-surface-hover text-text-light mb-1">
            <Store size={18} strokeWidth={2} />
          </div>
          <p className="text-sm font-medium text-text-secondary">No stores configured yet.</p>
        </div>
      )}

      {stores?.map(s => {
        const checked = selected.includes(s.id);

        return (
          <label
            key={s.id}
            className={cn(
              "group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors duration-150",
              checked
                ? "bg-primary-50 dark:bg-primary-500/15 text-primary-900 dark:text-primary-300"
                : "text-text-secondary hover:bg-surface-hover hover:text-text"
            )}
          >
            {/*
              Visually hidden native checkbox ensures keyboard accessibility and form semantics,
              while `peer` allows us to style the custom visual box below based on its state.
            */}
            <input
              type="checkbox"
              className="peer sr-only"
              checked={checked}
              onChange={() => toggle(s.id)}
            />

            {/* Custom Visual Checkbox */}
            <div
              className={cn(
                "flex items-center justify-center size-5 rounded-md border transition-colors duration-150 shrink-0",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500/50",
                checked
                  ? "bg-primary-600 border-primary-600 text-white"
                  : "bg-surface border-border group-hover:border-primary-400"
              )}
            >
              <Check
                size={14}
                strokeWidth={3}
                className={cn(
                  "transition-all duration-150",
                  checked ? "opacity-100 scale-100" : "opacity-0 scale-50"
                )}
              />
            </div>

            <span className="truncate">{s.name}</span>
          </label>
        );
      })}
    </div>
  );
};
import { useState, type FormEvent } from 'react';
import { Bookmark, Check, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Button } from '../button';
import { CountBadge } from '../countBadge';
import { SAVED_VIEW_NAME_MAX, type SavedView } from './useSavedViews';

interface SavedViewsMenuProps<T> {
  views: SavedView<T>[];
  onSave: (name: string) => void;
  onApply: (view: SavedView<T>) => void;
  onRemove: (id: string) => void;
  activeId?: string | null;
  className?: string;
}

export function SavedViewsMenu<T>({ views, onSave, onApply, onRemove, activeId, className }: SavedViewsMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSave(name);
    setName('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn('gap-2 rounded-full', className)} aria-label="Saved views">
          <Bookmark size={15} aria-hidden fill={activeId ? 'currentColor' : 'none'} className={activeId ? 'text-primary-600 dark:text-primary-300' : 'text-text-muted'} />
          <span className="hidden md:inline">Views</span>
          <CountBadge count={views.length} label={`${views.length} saved ${views.length === 1 ? 'view' : 'views'}`} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] p-3 flex flex-col gap-3">
        <div>
          <p className="text-sm font-display font-bold text-text">Saved views</p>
          <p className="text-xs font-display text-text-muted">Keep a layout with its filters, sort and grouping. Saved on this device.</p>
        </div>

        {views.length === 0 ? (
          <p className="rounded-lg border border-border px-3 py-4 text-center text-xs font-display text-text-muted">
            Nothing saved yet. Set the page up the way you like it, then save it below.
          </p>
        ) : (
          <ul className="flex flex-col gap-1 max-h-56 overflow-y-auto">
            {views.map((v) => (
              <li key={v.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => { onApply(v); setOpen(false); }}
                  className={cn(
                    'flex flex-1 min-w-0 items-center gap-2 min-h-11 sm:min-h-9 px-2.5 rounded-lg text-left text-sm font-display font-medium cursor-pointer transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
                    activeId === v.id ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'text-text hover:bg-surface-hover',
                  )}
                >
                  <span className="truncate flex-1">{v.name}</span>
                  {activeId === v.id && <Check size={14} aria-hidden className="shrink-0" />}
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(v.id)}
                  aria-label={`Delete saved view ${v.name}`}
                  className="flex size-9 pointer-coarse:size-11 shrink-0 items-center justify-center rounded-lg text-text-light hover:bg-danger/10 hover:text-danger transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={submit} className="flex items-center gap-2 pt-3 border-t border-border/60">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={SAVED_VIEW_NAME_MAX}
            placeholder="Name this view"
            aria-label="Name for the new saved view"
            className="h-11 sm:h-9 flex-1 min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-text placeholder:text-text-light outline-none focus:border-primary-400 focus:ring-4 focus:ring-primary-500/12"
          />
          <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>Save</Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}

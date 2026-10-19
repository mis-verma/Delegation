import { useMemo, useState } from 'react';
import { ArrowRightLeft, Check, Search } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/popover';
import { cn } from '@/lib/utils';
import { useOrgMove } from './orgMoveContext';

interface MoveToMenuProps {
  userId: string;
  userName: string;
  currentDepartmentId: string | null;
}

export const MoveToMenu = ({ userId, userName, currentDepartmentId }: MoveToMenuProps) => {
  const move = useOrgMove();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = move?.targets ?? [];
    return q ? list.filter((t) => `${t.name} ${t.storeName ?? ''}`.toLowerCase().includes(q)) : list;
  }, [move?.targets, query]);

  if (!move) return null;

  const choose = (departmentId: string | null, storeId: string | null) => {
    setOpen(false);
    move.moveUser(userId, departmentId === null ? { departmentId: null, storeId: null } : { departmentId, ...(storeId ? { storeId } : {}) });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Move ${userName} to another department`}
          className="shrink-0 inline-flex items-center justify-center gap-1.5 min-h-11 min-w-11 sm:min-h-8 sm:min-w-8 @md:px-2.5 rounded-lg border border-transparent text-xs font-display font-medium text-text-muted cursor-pointer transition-colors duration-150 hover:bg-surface-active hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        >
          <ArrowRightLeft className="size-3.5" aria-hidden />
          <span className="hidden @md:inline">Move to...</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-3.5 text-text-light pointer-events-none" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search departments"
            placeholder="Search departments..."
            className="w-full h-11 sm:h-9 rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-text placeholder:text-text-light outline-none transition-colors hover:border-border-hover focus:border-primary-500"
          />
        </div>

        <ul className="mt-2 flex max-h-60 flex-col gap-0.5 overflow-y-auto">
          {currentDepartmentId && !query && (
            <li>
              <button
                type="button"
                onClick={() => choose(null, null)}
                className="flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-lg px-2.5 text-left text-sm font-display text-text-secondary cursor-pointer transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:bg-surface-hover"
              >
                No department
              </button>
            </li>
          )}
          {options.length === 0 ? (
            <li className="px-2.5 py-3 text-xs font-display text-text-muted">No department matches that search.</li>
          ) : (
            options.map((t) => {
              const isCurrent = t.id === currentDepartmentId;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    disabled={isCurrent}
                    onClick={() => choose(t.id, t.storeId)}
                    className={cn(
                      'flex w-full min-h-11 sm:min-h-9 items-center gap-2 rounded-lg px-2.5 text-left font-display transition-colors focus-visible:outline-none',
                      isCurrent
                        ? 'cursor-default text-text-muted'
                        : 'cursor-pointer text-text hover:bg-surface-hover focus-visible:bg-surface-hover'
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{t.name}</span>
                      {t.storeName && <span className="block truncate text-xs text-text-muted">{t.storeName}</span>}
                    </span>
                    {isCurrent && <Check className="size-3.5 shrink-0 text-primary-600 dark:text-primary-400" aria-label="Current department" />}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
};

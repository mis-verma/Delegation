import { useMemo, useState } from 'react';
import { BellRing, CheckCheck, ListChecks, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../../components/ui/sheet';
import { Button, EmptyState, Input, ToggleChip } from '../../components';
import { useIsMobile } from '../../lib/useMediaQuery';
import type { PersonStatus } from '../../api/exceptions';
import { useNow, useRemindMutation } from './useAttention';
import { AttentionPersonRow } from './AttentionParts';
import { remindedRecently } from './attentionDisplay';

type Filter = 'all' | 'red' | 'orange' | 'repeat';

interface AttentionAllSheetProps {
  open: boolean;
  onClose: () => void;
  people: PersonStatus[];
  onOpenPerson: (userId: string) => void;
}

export const AttentionAllSheet = ({ open, onClose, people, onOpenPerson }: AttentionAllSheetProps) => {
  const isMobile = useIsMobile();
  const remind = useRemindMutation();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const counts = useMemo(() => ({
    all: people.length,
    red: people.filter((p) => p.level === 'red').length,
    orange: people.filter((p) => p.level === 'orange').length,
    repeat: people.filter((p) => p.missedStreak >= 2).length,
  }), [people]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (filter === 'red' && p.level !== 'red') return false;
      if (filter === 'orange' && p.level !== 'orange') return false;
      if (filter === 'repeat' && p.missedStreak < 2) return false;
      if (!q) return true;
      return [p.name, p.departmentName, p.storeName].some((v) => v?.toLowerCase().includes(q));
    });
  }, [people, query, filter]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const remindable = shown.filter((p) => !remindedRecently(p.lastRemindedAt, now));
  const allShownSelected = shown.length > 0 && shown.every((p) => selected.has(p.userId));
  const targetIds = selecting ? [...selected] : remindable.map((p) => p.userId);

  const send = () => {
    if (!targetIds.length) return;
    remind.mutate(targetIds, {
      onSuccess: () => {
        setSelected(new Set());
        setSelecting(false);
      },
    });
  };

  const FILTERS: { key: Filter; label: string }[] = [
    { key: 'all', label: `All ${counts.all}` },
    { key: 'red', label: `Needs you now ${counts.red}` },
    { key: 'orange', label: `Falling behind ${counts.orange}` },
    ...(counts.repeat ? [{ key: 'repeat' as const, label: `Repeat misses ${counts.repeat}` }] : []),
  ];

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        showCloseButton={false}
        className={cn('p-0 flex flex-col overflow-hidden font-sans shadow-none gap-0', isMobile ? 'max-h-[92dvh] rounded-t-2xl' : 'w-full sm:max-w-[520px] h-full')}
      >
        {isMobile && <span aria-hidden className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-border" />}
        <header className="flex flex-col gap-3 border-b border-border/60 px-4 pt-3 pb-3 sm:px-6 sm:pt-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <SheetTitle className="t-section font-display font-bold text-text">People to chase</SheetTitle>
              <SheetDescription className="t-meta font-medium text-text-muted">Red needs you now, orange is falling behind. Tap a name for their live score.</SheetDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 cursor-pointer"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <Input id="attention-search" icon={Search} placeholder="Search name, department or store" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" aria-label="Search people" />
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <ToggleChip key={f.key} on={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</ToggleChip>
            ))}
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {shown.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState size="compact" tone={people.length ? 'neutral' : 'success'} icon={CheckCheck} title={people.length ? 'Nobody matches' : 'Everyone is on track'} description={people.length ? 'Try another name or filter.' : 'Nobody to chase right now.'} />
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border/60">
              {shown.map((p) => (
                <AttentionPersonRow key={p.userId} person={p} onOpen={onOpenPerson} selectable={selecting} selected={selected.has(p.userId)} onToggle={toggle} />
              ))}
            </div>
          )}
        </div>

        {people.length > 0 && (
          <footer className="flex items-center gap-2 border-t border-border/60 bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6">
            {selecting ? (
              <>
                <Button type="button" variant="ghost" size="md" className="pointer-coarse:h-11" onClick={() => setSelected(allShownSelected ? new Set() : new Set(shown.map((p) => p.userId)))}>
                  {allShownSelected ? 'Clear' : 'Select all'}
                </Button>
                <Button type="button" variant="outline" size="md" className="pointer-coarse:h-11" onClick={() => { setSelecting(false); setSelected(new Set()); }}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button type="button" variant="outline" size="md" className="pointer-coarse:h-11" onClick={() => setSelecting(true)}>
                <ListChecks className="size-4" aria-hidden />
                Select
              </Button>
            )}
            <Button type="button" variant="primary" size="md" className="flex-1 pointer-coarse:h-11" onClick={send} isLoading={remind.isPending} disabled={targetIds.length === 0}>
              <BellRing className="size-4" aria-hidden />
              {selecting ? `Remind ${selected.size || ''}`.trim() : `Remind ${remindable.length} shown`}
            </Button>
          </footer>
        )}
      </SheetContent>
    </Sheet>
  );
};

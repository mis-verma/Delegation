import { useState } from 'react';
import { Ban, Check, ChevronsUpDown, Search, Users } from 'lucide-react';
import { Modal } from '../../../components';
import { Badge } from '../../../components/ui/badge';
import { cn } from '@/lib/utils';
import { avatarColorClass } from '../../../lib/avatarColors';
import { getInitials } from '../../../lib/getInitials';
import type { AuditPerson, AuditStatus } from './ChecklistAuditHelpers';

const SEARCH_FROM = 8;

export const AuditStatusChip = ({ status }: { status: AuditStatus }) => {
  switch (status) {
    case 'done':
      return <Badge variant="success"><Check strokeWidth={3} aria-hidden />Done</Badge>;
    case 'flagged':
      return <Badge variant="warning">Flagged</Badge>;
    case 'na':
      return <Badge variant="neutral"><Ban strokeWidth={2.5} aria-hidden />Not applicable</Badge>;
    case 'progress':
      return <Badge variant="default">In progress</Badge>;
    default:
      return <Badge variant="neutral">Not started</Badge>;
  }
};

export const AuditAvatar = ({ name, size, status }: { name: string; size: 'row' | 'panel'; status?: AuditStatus }) => {
  const finished = status === 'done' || status === 'flagged' || status === 'na';
  const muted = status === 'na';
  return (
    <span className="relative shrink-0">
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-full font-bold text-white',
          avatarColorClass(name),
          size === 'row' ? 'size-9 t-meta' : 'size-11 sm:size-10 text-sm sm:text-xs',
        )}
      >
        {getInitials(name)}
      </span>
      {size === 'panel' && finished && (
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-4 rounded-full ring-2 ring-surface',
            muted ? 'bg-surface-active text-text-muted' : 'bg-success text-white',
          )}
        >
          {muted ? <Ban size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3.5} />}
        </span>
      )}
    </span>
  );
};

const PersonRow = ({ person, active, onSelect }: { person: AuditPerson; active: boolean; onSelect: () => void }) => (
  <button
    type="button"
    aria-current={active ? 'true' : undefined}
    onClick={onSelect}
    className={cn(
      'flex w-full items-center gap-3 h-14 px-2.5 rounded-lg border text-left cursor-pointer outline-none',
      'transition-[background-color,border-color] duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
      'focus-visible:ring-2 focus-visible:ring-primary-500/40 active:bg-surface-hover',
      active
        ? 'border-primary-600 dark:border-primary-400 bg-primary-500/10 dark:bg-primary-500/15'
        : 'border-border/60 bg-surface hover:border-border-hover',
    )}
  >
    <AuditAvatar name={person.name} size="row" />
    <span className="flex-1 min-w-0 flex flex-col">
      <span className="t-card sm:text-sm font-semibold leading-snug text-text truncate">
        {person.name}{person.isMe && <span className="font-medium text-text-muted"> (You)</span>}
      </span>
      {(person.store || person.dressType) && (
        <span className="t-meta text-text-muted truncate">{[person.store, person.dressType].filter(Boolean).join(' · ')}</span>
      )}
    </span>
    <AuditStatusChip status={person.status} />
  </button>
);

interface AuditPeopleListProps {
  people:     AuditPerson[];
  selectedId: string | null;
  onSelect:   (id: string) => void;
  className?: string;
}

export const AuditPeopleList = ({ people, selectedId, onSelect, className }: AuditPeopleListProps) => {
  const [query, setQuery] = useState('');
  const searchable = people.length > SEARCH_FROM;
  const q = query.trim().toLowerCase();
  const shown = q ? people.filter(p => p.name.toLowerCase().includes(q)) : people;

  return (
    <div className={cn('flex flex-col gap-2 min-h-0', className)}>
      {searchable && (
        <label className="relative flex items-center">
          <span className="sr-only">Search people</span>
          <Search size={16} className="absolute left-3 text-text-light pointer-events-none" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by name"
            className="w-full h-11 sm:h-10 pl-9 pr-3 rounded-lg border border-border bg-surface text-sm text-text placeholder:text-text-light outline-none transition-colors duration-150 hover:border-border-hover focus:border-primary-500"
          />
        </label>
      )}
      {shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted">Nobody matches that name.</p>
      ) : (
        <ul className="flex flex-col gap-2 min-h-0 overflow-y-auto custom-scrollbar">
          {shown.map(p => (
            <li key={p.id}>
              <PersonRow person={p} active={p.id === selectedId} onSelect={() => onSelect(p.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface AuditPersonPickerProps {
  people:     AuditPerson[];
  selectedId: string | null;
  doneCount:  number;
  onSelect:   (id: string) => void;
}

export const AuditPersonPicker = ({ people, selectedId, doneCount, onSelect }: AuditPersonPickerProps) => {
  const [open, setOpen] = useState(false);
  const index = Math.max(people.findIndex(p => p.id === selectedId), 0);
  const current = people[index];
  if (!current) return null;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          'flex w-full items-center gap-3 h-14 px-2.5 rounded-lg border border-border/60 bg-surface text-left cursor-pointer outline-none',
          'transition-[background-color,border-color] duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
          'hover:border-border-hover active:bg-surface-hover focus-visible:ring-2 focus-visible:ring-primary-500/40',
        )}
      >
        <AuditAvatar name={current.name} size="row" />
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="t-card font-semibold leading-snug text-text truncate">
            {current.name}{current.isMe && <span className="font-medium text-text-muted"> (You)</span>}
          </span>
          <span className="t-meta text-text-muted tabular-nums">Person {index + 1} of {people.length}. Tap to switch.</span>
        </span>
        <ChevronsUpDown size={18} className="shrink-0 text-text-muted" aria-hidden />
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Choose a person"
        description={`${doneCount} of ${people.length} checked`}
        icon={<Users size={18} aria-hidden />}
        size="md"
        bodyClassName="gap-3 px-3 sm:px-5"
      >
        <AuditPeopleList
          people={people}
          selectedId={selectedId}
          onSelect={id => { onSelect(id); setOpen(false); }}
        />
      </Modal>
    </>
  );
};

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronDown, Plus, ShieldAlert, X } from 'lucide-react';
import { Dropdown } from '../dropdown';

const POINT_CHOICES = [1, 2, 3, 4, 5, 10, 15, 20, 25, 50, 100];

interface AccessoriesListEditorProps {
  label?:       string;
  placeholder?: string;
  accessories:  string[];
  onChange:     (accessories: string[]) => void;
  labelAction?: ReactNode;
  critical?:    readonly string[];
  onToggleCritical?: (name: string) => void;
  points?:      Readonly<Record<string, number>>;
  onPointsChange?: (name: string, points: number) => void;
}

export const AccessoriesListEditor = ({
  label = 'Accessories checklist',
  placeholder = 'Type and press Enter',
  accessories,
  onChange,
  labelAction,
  critical,
  onToggleCritical,
  points,
  onPointsChange,
}: AccessoriesListEditorProps) => {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const isDuplicate = trimmed.length > 0 && accessories.some((a) => a.toLowerCase() === trimmed.toLowerCase());

  const add = () => {
    if (!trimmed || isDuplicate) return;
    onChange([...accessories, trimmed]);
    setDraft('');
  };

  const remove = (name: string) => onChange(accessories.filter((a) => a !== name));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    }
    if (e.key === 'Backspace' && !draft && accessories.length && !window.matchMedia('(pointer: coarse)').matches) remove(accessories[accessories.length - 1]);
  };

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {labelAction ? (
        <div className="flex items-center justify-between gap-2">
          <span className="t-meta font-display font-medium text-text-muted">{label}</span>
          {labelAction}
        </div>
      ) : (
        <span className="t-meta font-display font-medium text-text-muted">{label}</span>
      )}
      <div className="flex flex-wrap items-center gap-1.5 pointer-coarse:gap-2 min-h-10 p-1.5 rounded-xl border border-border bg-surface transition-colors duration-150 focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20">
        {accessories.map((name) => {
          const isCritical = !!critical?.includes(name);
          return (
          <span
            key={name}
            className={`inline-flex items-center gap-1 h-7 pointer-coarse:h-11 pl-2.5 pr-1 rounded-full t-meta font-display font-medium transition-colors duration-150 ${isCritical ? 'bg-danger/10 text-danger border border-danger/30' : 'bg-surface-hover text-text'}`}
          >
            {name}
            {onPointsChange && (
              <Dropdown
                align="start"
                trigger={
                  <button
                    type="button"
                    aria-label={`${name} is worth ${points?.[name] ?? 1} ${(points?.[name] ?? 1) === 1 ? 'point' : 'points'}. Change points`}
                    title="Points for this item"
                    className="inline-flex items-center gap-0.5 h-5 pointer-coarse:h-11 px-1.5 rounded-full bg-surface border border-border/70 t-meta font-display font-semibold tabular-nums text-text-secondary cursor-pointer transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    {points?.[name] ?? 1} pt
                    <ChevronDown size={10} aria-hidden />
                  </button>
                }
                items={POINT_CHOICES.map((value) => ({
                  label: `${value} ${value === 1 ? 'point' : 'points'}`,
                  onClick: () => onPointsChange(name, value),
                }))}
              />
            )}
            {onToggleCritical && (
              <button
                type="button"
                onClick={() => onToggleCritical(name)}
                aria-pressed={isCritical}
                aria-label={isCritical ? `${name} is critical. Tap to make it normal` : `Mark ${name} as critical`}
                title={isCritical ? 'Critical: missing it fails the person' : 'Mark as critical'}
                className={`flex items-center justify-center size-5 pointer-coarse:size-11 rounded-full cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 ${isCritical ? 'text-danger hover:bg-danger/15' : 'text-text-light hover:bg-danger/10 hover:text-danger'}`}
              >
                <ShieldAlert size={12} strokeWidth={isCritical ? 2.75 : 2} />
              </button>
            )}
            <button
              type="button"
              onClick={() => remove(name)}
              className="flex items-center justify-center size-5 pointer-coarse:size-11 rounded-full text-text-muted cursor-pointer hover:bg-danger/10 hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              aria-label={`Remove ${name}`}
            >
              <X size={11} />
            </button>
          </span>
          );
        })}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={add}
          placeholder={accessories.length ? 'Add another…' : placeholder}
          aria-label={label}
          className="flex-1 min-w-32 h-7 pointer-coarse:h-11 px-1.5 bg-transparent text-sm font-display text-text placeholder:text-text-light focus:outline-none"
        />
        {trimmed && !isDuplicate && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={add}
            className="flex items-center justify-center size-7 pointer-coarse:size-11 rounded-full bg-primary-600 text-white cursor-pointer hover:bg-primary-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            aria-label="Add"
          >
            <Plus size={14} />
          </button>
        )}
      </div>
      {isDuplicate && <span className="t-meta font-display text-danger">That one’s already in the list.</span>}
    </div>
  );
};

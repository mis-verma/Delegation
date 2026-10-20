import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Plus, X } from 'lucide-react';

interface AccessoriesListEditorProps {
  label?:       string;
  placeholder?: string;
  accessories:  string[];
  onChange:     (accessories: string[]) => void;
  labelAction?: ReactNode;
}

export const AccessoriesListEditor = ({
  label = 'Accessories checklist',
  placeholder = 'Type and press Enter',
  accessories,
  onChange,
  labelAction,
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
        {accessories.map((name) => (
          <span
            key={name}
            className="inline-flex items-center gap-1 h-7 pointer-coarse:h-11 pl-2.5 pr-1 rounded-full bg-surface-hover t-meta font-display font-medium text-text"
          >
            {name}
            <button
              type="button"
              onClick={() => remove(name)}
              className="flex items-center justify-center size-5 pointer-coarse:size-11 rounded-full text-text-muted cursor-pointer hover:bg-danger/10 hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
              aria-label={`Remove ${name}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
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

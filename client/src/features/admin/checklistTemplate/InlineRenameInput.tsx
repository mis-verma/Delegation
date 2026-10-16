import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

interface InlineRenameInputProps {
  value: string;
  /** Accessible name, e.g. "Template name" or "Step 2 label". */
  label: string;
  /** Called with the trimmed new text, only when it is non-empty and actually different. */
  onSave: (next: string) => void;
  onCancel: () => void;
  className?: string;
}

// The one inline text editor for a template's name and a step's label: Enter or leaving the field
// saves, Escape cancels, an empty or unchanged value just closes. 16px on a phone so iOS does not
// zoom the page when it takes focus.
export const InlineRenameInput = ({ value, label, onSave, onCancel, className }: InlineRenameInputProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  // Enter/Escape close the editor, which can blur the field a moment later: only act once.
  const doneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const next = inputRef.current?.value.trim() ?? '';
    if (!next || next === value) onCancel();
    else onSave(next);
  };

  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  };

  return (
    <input
      ref={inputRef}
      defaultValue={value}
      aria-label={label}
      maxLength={191}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      }}
      className={cn(
        'w-full min-w-0 min-h-11 sm:min-h-9 px-3 text-sm font-display font-medium bg-background text-text rounded-lg border border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-all',
        className,
      )}
    />
  );
};

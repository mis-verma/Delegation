import { Ban, Check, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { onRadioKeyDown } from './radioGroupKeys';

type GoodAnswer = 'YES' | 'NO' | null;

interface GoodAnswerPickerProps {
  yes: string;
  no: string;
  value: GoodAnswer;
  onChange: (value: GoodAnswer) => void;
}

export const GoodAnswerPicker = ({ yes, no, value, onChange }: GoodAnswerPickerProps) => {
  const options: { key: GoodAnswer; label: string; hint: string; icon: LucideIcon; good: boolean }[] = [
    { key: null, label: 'Not scored', hint: 'Any answer is fine', icon: Ban, good: false },
    { key: 'YES', label: `${yes} is good`, hint: `${no} counts against compliance`, icon: Check, good: true },
    { key: 'NO', label: `${no} is good`, hint: `${yes} counts against compliance`, icon: X, good: true },
  ];

  return (
    <div className="@container">
    <div role="radiogroup" aria-label="Which answer is good" className="grid grid-cols-1 gap-2 @lg:grid-cols-3">
      {options.map((option, index) => {
        const on = value === option.key;
        const Icon = option.icon;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.key)}
            onKeyDown={(e) => onRadioKeyDown(e, index, options.length, (next) => onChange(options[next].key))}
            className={cn(
              'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-2.5 text-left outline-none transition-colors duration-150 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
              on ? (option.good ? 'border-success/50 bg-success/10' : 'border-primary-500/50 bg-primary-500/8') : 'border-border/60 bg-surface hover:border-border-hover',
            )}
          >
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-xl',
                on ? (option.good ? 'bg-success text-white' : 'bg-primary-600 text-white') : 'bg-surface-hover text-text-secondary',
              )}
              aria-hidden="true"
            >
              <Icon size={17} strokeWidth={2.5} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="t-meta font-display font-bold text-text">{option.label}</span>
              <span className="t-meta text-text-muted">{option.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
    </div>
  );
};

import { useState } from 'react';
import { Clock } from 'lucide-react';
import { Input, ToggleChip } from '../../../components';

const PRESETS = [
  { hours: 4, label: '4 hours' },
  { hours: 8, label: '8 hours' },
  { hours: 24, label: '1 day' },
  { hours: 48, label: '2 days' },
  { hours: 72, label: '3 days' },
] as const;

const MAX_HOURS = 24 * 90;

interface TatHoursPickerProps {
  value: number | null;
  onChange: (hours: number | null) => void;
  disabled?: boolean;
  hint?: string;
}

export const TatHoursPicker = ({ value, onChange, disabled, hint }: TatHoursPickerProps) => {
  const isPreset = value !== null && PRESETS.some((p) => p.hours === value);
  const [typed, setTyped] = useState(value !== null && !isPreset ? String(value) : '');
  const typedNumber = Number(typed);
  const typedInvalid = typed !== '' && (!/^[0-9]+$/.test(typed) || typedNumber < 1 || typedNumber > MAX_HOURS);

  return (
    <div className="flex flex-col gap-2">
      <span className="inline-flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
        <Clock size={14} className="text-text-light" aria-hidden />
        Time to finish
      </span>
      <div role="radiogroup" aria-label="Time to finish" className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <ToggleChip
            key={p.hours}
            on={value === p.hours}
            disabled={disabled}
            onClick={() => { setTyped(''); onChange(p.hours); }}
          >
            {p.label}
          </ToggleChip>
        ))}
      </div>
      <Input
        inputMode="numeric"
        placeholder="Or type hours, e.g. 36"
        aria-label="Time to finish, in hours"
        value={typed}
        disabled={disabled}
        suffix={<span className="t-meta text-text-light">hours</span>}
        error={typedInvalid ? `Enter whole hours, 1 to ${MAX_HOURS}` : undefined}
        onChange={(e) => {
          const next = e.target.value.trim();
          setTyped(next);
          const n = Number(next);
          onChange(/^[0-9]+$/.test(next) && n >= 1 && n <= MAX_HOURS ? n : null);
        }}
      />
      {hint && <span className="t-meta text-text-muted">{hint}</span>}
    </div>
  );
};

import { useEffect, useRef, useState } from 'react';
import { Clock as ClockIcon, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TimePickerProps {
  /** 24-hour "HH:mm" string, or '' when unset. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  disabled?: boolean;
  /** Floats the dial under the trigger instead of expanding inline — for chip rows, where an
   *  inline panel would shove the neighbouring chips around. */
  popover?: boolean;
  /** Text before the time on the trigger, e.g. `Opens` → "Opens 9:30 AM". */
  prefix?: string;
}

const HOUR_MARKS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const DIAL_SIZE = 176;
const DIAL_RADIUS = 72;
const DIAL_CENTER = DIAL_SIZE / 2;

const dialMarkPosition = (index: number) => {
  const angle = (index / 12) * 2 * Math.PI - Math.PI / 2;
  return {
    left: DIAL_CENTER + DIAL_RADIUS * Math.cos(angle),
    top: DIAL_CENTER + DIAL_RADIUS * Math.sin(angle),
  };
};

const parseHHMM = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? { h, m } : null;
};

const formatHHMM = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

const formatDisplay = (h: number, m: number) => {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
};

// Time-only sibling of DatePicker — same clock-face dial and inline-expanding trigger, minus the
// calendar grid, for fields that need a bare time-of-day with no date attached (e.g. a recurring
// daily open/close window). Kept as its own component rather than a DatePicker mode because
// "no date, just a time" has no month grid to anchor the dial to.
export function TimePicker({
  value,
  onChange,
  placeholder = 'Select a time',
  className = '',
  triggerClassName = '',
  disabled = false,
  popover = false,
  prefix,
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const [dialMode, setDialMode] = useState<'hour' | 'minute'>('hour');
  const containerRef = useRef<HTMLDivElement>(null);

  const hasValue = !!value;
  // The dial always shows a highlighted position, defaulting to 9:00 AM until the user actually
  // picks something — same idea as DatePicker seeding its time dial from "now" on first pick.
  const draft = parseHHMM(value) ?? { h: 9, m: 0 };

  const selectHour = (hour12: number) => {
    const isPM = draft.h >= 12;
    onChange(formatHHMM((hour12 % 12) + (isPM ? 12 : 0), draft.m));
    setDialMode('minute');
  };

  const selectMinute = (minute: number) => {
    onChange(formatHHMM(draft.h, minute));
  };

  const setPeriod = (period: 'AM' | 'PM') => {
    const isPM = draft.h >= 12;
    if ((period === 'PM') === isPM) return;
    onChange(formatHHMM(period === 'PM' ? draft.h + 12 : draft.h - 12, draft.m));
  };

  const toggleOpen = () => {
    if (disabled) return;
    if (!open) setDialMode('hour');
    setOpen((prev) => !prev);
  };

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const period: 'AM' | 'PM' = draft.h >= 12 ? 'PM' : 'AM';
  const hour12 = draft.h % 12 === 0 ? 12 : draft.h % 12;
  const handAngleDeg = dialMode === 'hour' ? (hour12 % 12) * 30 : (draft.m / 60) * 360;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        aria-expanded={open}
        className={cn(
          'flex items-center gap-2.5 w-full h-11 px-4 rounded-xl border bg-surface text-sm transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-hover',
          open ? 'border-primary-500' : 'border-border hover:border-border-hover',
          triggerClassName,
        )}
      >
        <ClockIcon size={16} className="text-text-light shrink-0" />
        <span className={cn('truncate', hasValue ? 'text-text font-medium' : 'text-text-muted font-medium')}>
          {prefix && <span className="text-text-muted font-medium">{prefix} </span>}
          {hasValue ? formatDisplay(draft.h, draft.m) : placeholder}
        </span>
        {hasValue && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear time"
            className="ml-auto p-1.5 text-text-light bg-surface-hover hover:bg-danger/10 hover:text-danger rounded-full transition-colors shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
            onClick={(e) => {
              e.stopPropagation();
              onChange('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onChange('');
              }
            }}
          >
            <X size={14} />
          </span>
        )}
      </button>

      {/* Inline: same grid-rows "animate to auto height" trick as DatePicker, so it expands in place.
          Popover: floats under the trigger (chip rows). One panel, two wrappers. */}
      <div className={popover
        ? cn('absolute left-0 top-full z-50 mt-2 w-64 rounded-2xl border border-border bg-surface p-3 shadow-lg shadow-black/10 origin-top transition-[opacity,transform] duration-150', open ? 'opacity-100 scale-100' : 'pointer-events-none opacity-0 scale-95 invisible')
        : cn('grid transition-[grid-template-rows] duration-300 ease-in-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className={popover ? '' : 'overflow-hidden'}>
          <div className={cn('flex flex-col gap-2.5', !popover && 'mt-3 pt-3 border-t border-border/60')}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDialMode('hour')}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-base font-display font-bold tabular-nums transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                    dialMode === 'hour' ? 'bg-primary-500/10 text-primary-600' : 'text-text hover:bg-surface-hover',
                  )}
                >
                  {String(hour12).padStart(2, '0')}
                </button>
                <span className="text-base font-bold text-text-secondary">:</span>
                <button
                  type="button"
                  onClick={() => setDialMode('minute')}
                  className={cn(
                    'px-1.5 py-0.5 rounded text-base font-display font-bold tabular-nums transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                    dialMode === 'minute' ? 'bg-primary-500/10 text-primary-600' : 'text-text hover:bg-surface-hover',
                  )}
                >
                  {String(draft.m).padStart(2, '0')}
                </button>
              </div>

              <div className="flex rounded-md border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setPeriod('AM')}
                  aria-pressed={period === 'AM'}
                  className={cn(
                    'px-2 py-1 t-meta font-bold transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50',
                    period === 'AM' ? 'bg-primary-600 text-white' : 'bg-surface text-text-muted hover:bg-surface-hover',
                  )}
                >
                  AM
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('PM')}
                  aria-pressed={period === 'PM'}
                  className={cn(
                    'px-2 py-1 t-meta font-bold transition-colors cursor-pointer border-l border-border outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500/50',
                    period === 'PM' ? 'bg-primary-600 text-white' : 'bg-surface text-text-muted hover:bg-surface-hover',
                  )}
                >
                  PM
                </button>
              </div>
            </div>

            {/* Watch-face dial — every value is a tap target arranged around the circle, same
                visual language as DatePicker's embedded time dial. */}
            <div className="relative mx-auto shrink-0" style={{ width: DIAL_SIZE, height: DIAL_SIZE }}>
              <div className="absolute inset-0 rounded-full bg-surface-hover/60 border border-border/60" />

              <div
                className="absolute bg-primary-500/60 rounded-full pointer-events-none"
                style={{
                  width: 2,
                  height: DIAL_RADIUS - 6,
                  left: DIAL_CENTER - 1,
                  top: DIAL_CENTER - (DIAL_RADIUS - 6),
                  transform: `rotate(${handAngleDeg}deg)`,
                  transformOrigin: `1px ${DIAL_RADIUS - 6}px`,
                }}
              />
              <div className="absolute size-1.5 rounded-full bg-primary-600 pointer-events-none" style={{ left: DIAL_CENTER - 3, top: DIAL_CENTER - 3 }} />

              {(dialMode === 'hour' ? HOUR_MARKS : MINUTE_MARKS).map((markValue, i) => {
                const pos = dialMarkPosition(i);
                const isActive = dialMode === 'hour' ? markValue === hour12 : markValue === draft.m;
                return (
                  <button
                    key={markValue}
                    type="button"
                    onClick={() => (dialMode === 'hour' ? selectHour(markValue) : selectMinute(markValue))}
                    aria-label={dialMode === 'hour' ? `${markValue} o'clock` : `${markValue} minutes`}
                    aria-pressed={isActive}
                    className={cn(
                      'absolute size-7 -translate-x-1/2 -translate-y-1/2 rounded-full t-meta font-display font-bold transition-colors cursor-pointer flex items-center justify-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
                      isActive ? 'bg-primary-600 text-white shadow-sm' : 'text-text-secondary hover:bg-surface-active',
                    )}
                    style={{ left: pos.left, top: pos.top }}
                  >
                    {dialMode === 'minute' ? String(markValue).padStart(2, '0') : markValue}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

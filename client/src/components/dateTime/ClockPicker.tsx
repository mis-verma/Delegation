import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { formatClock, withClock } from './calendarCore';

const HOUR_MARKS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_MARKS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const QUICK_TIMES = [9, 12, 15, 18];

const DIAL_MOUSE = { size: 176, radius: 70, mark: 'size-8' };
const DIAL_TOUCH = { size: 232, radius: 94, mark: 'size-10' };

const segment = (on: boolean) => cn(
  'px-2.5 py-1 pointer-coarse:py-2 rounded-md text-lg font-display font-bold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 [-webkit-tap-highlight-color:transparent]',
  on ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white border border-transparent dark:from-primary-400 dark:to-primary-600' : 'text-text-muted border border-transparent hover:text-text',
);

interface ClockPickerProps {
  value: Date | null;
  onChange: (next: Date) => void;
  label?: string;
  minAt?: Date | null;
  onTouch?: () => void;
}

export const ClockPicker = ({ value, onChange, label, minAt, onTouch }: ClockPickerProps) => {
  const coarse = useMediaQuery('(pointer: coarse)');
  const dial = coarse ? DIAL_TOUCH : DIAL_MOUSE;
  const center = dial.size / 2;
  const handLength = dial.radius - 8;

  const [mode, setMode] = useState<'hour' | 'minute'>('hour');
  const [error, setError] = useState<string | null>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const apply = (next: Date) => {
    if (minAt && next.getTime() < minAt.getTime()) {
      setError('That time has already passed.');
      return false;
    }
    setError(null);
    onChange(next);
    return true;
  };

  const hour12 = value ? (value.getHours() % 12 === 0 ? 12 : value.getHours() % 12) : 12;
  const minute = value ? value.getMinutes() : 0;
  const isPM = !!value && value.getHours() >= 12;

  const setHour = (h12: number) => {
    if (!value) return;
    const next = new Date(value);
    next.setHours((h12 % 12) + (isPM ? 12 : 0));
    if (next.getTime() === value.getTime()) return;
    apply(next);
  };
  const setMinute = (m: number) => {
    if (!value) return;
    const next = new Date(value);
    next.setMinutes(m);
    if (next.getTime() === value.getTime()) return;
    apply(next);
  };
  const setPeriod = (period: 'AM' | 'PM') => {
    if (!value || (period === 'PM') === isPM) return;
    onTouch?.();
    const next = new Date(value);
    next.setHours(period === 'PM' ? value.getHours() + 12 : value.getHours() - 12);
    apply(next);
  };

  const fromPointer = (e: React.PointerEvent) => {
    if (!value || !faceRef.current) return;
    const rect = faceRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let angle = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (angle < 0) angle += 360;
    if (mode === 'hour') setHour(Math.round(angle / 30) % 12 || 12);
    else setMinute(Math.round(angle / 6) % 60);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!value) return;
    onTouch?.();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    fromPointer(e);
  };
  const onPointerMove = (e: React.PointerEvent) => { if (dragging.current) fromPointer(e); };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (mode === 'hour') setMode('minute');
  };

  const handAngle = mode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const marks = mode === 'hour' ? HOUR_MARKS : MINUTE_MARKS;
  const markPosition = (i: number) => {
    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
    return { left: center + dial.radius * Math.cos(angle), top: center + dial.radius * Math.sin(angle) };
  };

  return (
    <div className="flex flex-col items-center gap-3 min-w-0">
      {label && (
        <div className="flex w-full items-baseline justify-between gap-2">
          <span className="t-meta font-display font-semibold text-text-muted">{label}</span>
          <span className="text-sm font-display font-bold text-text tabular-nums">{value ? formatClock(value) : 'Pick a day first'}</span>
        </div>
      )}

      <div className="grid w-full grid-cols-4 gap-1.5" role="group" aria-label="Quick times">
        {QUICK_TIMES.map((hour) => {
          const selected = !!value && value.getHours() === hour && value.getMinutes() === 0;
          const candidate = value ? withClock(value, hour, 0) : null;
          const past = !!candidate && !!minAt && candidate.getTime() < minAt.getTime();
          return (
            <button
              key={hour}
              type="button"
              disabled={!value || past}
              aria-pressed={selected}
              onClick={() => { onTouch?.(); if (candidate) apply(candidate); }}
              className={cn(
                'h-9 pointer-coarse:h-11 rounded-lg border t-meta font-display font-semibold tabular-nums transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-40 [-webkit-tap-highlight-color:transparent]',
                selected
                  ? 'bg-gradient-to-br from-primary-500/15 to-primary-500/5 border-primary-500/40 text-primary-700 dark:text-primary-300'
                  : 'border-border/60 bg-surface text-text-secondary hover:border-primary-400 hover:bg-primary-500/5',
              )}
            >
              {formatClock(withClock(new Date(2000, 0, 1), hour, 0)).replace(':00', '')}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex items-center p-1 bg-surface-hover/80 rounded-xl" role="group" aria-label="Hour and minute">
          <button type="button" disabled={!value} onClick={() => setMode('hour')} aria-pressed={mode === 'hour'} aria-label="Set the hour" className={segment(mode === 'hour')}>
            {String(hour12).padStart(2, '0')}
          </button>
          <span className="px-0.5 text-lg font-bold text-text-light" aria-hidden>:</span>
          <button type="button" disabled={!value} onClick={() => setMode('minute')} aria-pressed={mode === 'minute'} aria-label="Set the minutes" className={segment(mode === 'minute')}>
            {String(minute).padStart(2, '0')}
          </button>
        </div>
        <div className="flex p-1 bg-surface-hover/80 rounded-xl" role="group" aria-label="AM or PM">
          {(['AM', 'PM'] as const).map((p) => (
            <button
              key={p}
              type="button"
              disabled={!value}
              onClick={() => setPeriod(p)}
              aria-pressed={(p === 'PM') === isPM}
              className={cn(segment((p === 'PM') === isPM), 't-meta')}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <span className="t-meta font-medium text-text-light">
        {!value ? 'Pick a day first' : mode === 'hour' ? 'Tap or drag to set the hour' : 'Tap or drag to set the minutes'}
      </span>

      <div
        ref={faceRef}
        className={cn('relative shrink-0 touch-none select-none rounded-full', !value && 'opacity-50')}
        style={{ width: dial.size, height: dial.size }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-b from-surface to-surface-hover/80 border border-border" />
        <div className="absolute inset-3 rounded-full border border-dashed border-border/60 pointer-events-none" />
        <div
          className="absolute bg-gradient-to-t from-primary-600 to-primary-400 rounded-full pointer-events-none transition-transform duration-200 ease-out"
          style={{
            width: 2,
            height: handLength,
            left: center - 1,
            top: center - handLength,
            transform: `rotate(${handAngle}deg)`,
            transformOrigin: `1px ${handLength}px`,
          }}
        />
        <div className="absolute size-2.5 rounded-full bg-primary-600 ring-2 ring-surface pointer-events-none" style={{ left: center - 5, top: center - 5 }} />

        {marks.map((mark, i) => {
          const pos = markPosition(i);
          const active = mode === 'hour' ? mark === hour12 : mark === minute;
          return (
            <button
              key={`${mode}-${mark}`}
              type="button"
              disabled={!value}
              onClick={() => (mode === 'hour' ? setHour(mark) : setMinute(mark))}
              aria-label={mode === 'hour' ? `${mark} o'clock` : `${mark} minutes`}
              aria-pressed={active}
              className={cn(
                'absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none rounded-full t-meta font-semibold transition-colors duration-150 flex items-center justify-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50',
                dial.mark,
                active ? 'bg-gradient-to-br from-primary-500 to-primary-700 text-white dark:from-primary-400 dark:to-primary-600' : 'text-text-secondary',
              )}
              style={{ left: pos.left, top: pos.top }}
            >
              {mode === 'minute' ? String(mark).padStart(2, '0') : mark}
            </button>
          );
        })}
      </div>

      {error && <p className="t-meta text-danger font-display" role="alert">{error}</p>}
    </div>
  );
};

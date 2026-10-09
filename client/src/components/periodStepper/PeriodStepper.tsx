import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '../button';

interface PeriodStepperProps {
  /** What is showing now, e.g. "28 Sep to 4 Oct" or "2026". */
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** Adds a "jump back to now" button, e.g. "This week" or "This year". */
  todayLabel?: string;
  onToday?: () => void;
  prevLabel?: string;
  nextLabel?: string;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
}

// Previous / next period control shared by the weekly report and the holiday calendar.
export const PeriodStepper = ({ label, onPrev, onNext, todayLabel, onToday, prevLabel = 'Previous', nextLabel = 'Next', prevDisabled, nextDisabled }: PeriodStepperProps) => (
  <div className="flex items-center gap-2 flex-wrap">
    <Button variant="outline" size="sm" className="size-11 sm:size-8 px-0" onClick={onPrev} disabled={prevDisabled} aria-label={prevLabel}>
      <ChevronLeft size={16} />
    </Button>
    <span className="min-w-36 text-center text-sm font-display font-semibold text-text tabular-nums">{label}</span>
    <Button variant="outline" size="sm" className="size-11 sm:size-8 px-0" onClick={onNext} disabled={nextDisabled} aria-label={nextLabel}>
      <ChevronRight size={16} />
    </Button>
    {todayLabel && onToday && (
      <Button variant="ghost" size="sm" onClick={onToday}>{todayLabel}</Button>
    )}
  </div>
);

import { Workflow } from 'lucide-react';
import { SlidingTabs } from '../../../components/slidingTabs';
import { ASSIGNMENT_OPTIONS, FRONT_LINE_OPTIONS } from './assignmentOptions';

interface AssignmentModeToggleProps {
  mode: 'MANUAL' | 'AUTO';
  onChange: (mode: 'MANUAL' | 'AUTO') => void;
  frontLine?: boolean;
  hideLabel?: boolean;
}

export const AssignmentModeToggle = ({ mode, onChange, frontLine = false, hideLabel = false }: AssignmentModeToggleProps) => {
  const options = frontLine ? FRONT_LINE_OPTIONS : ASSIGNMENT_OPTIONS;
  return (
    <div className="flex flex-col gap-1.5">
      {!hideLabel && (
        <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary">
          <Workflow size={14} className="text-text-light" />
          How to send it
        </span>
      )}
      <SlidingTabs
        label="How to send it"
        pressed
        fill
        size="sm"
        value={mode}
        options={options.map(({ value, label, icon }) => ({ value, label, icon }))}
        onChange={onChange}
      />
      <p className="px-1 t-meta font-display text-text-muted">
        {options.find((o) => o.value === mode)?.help}
      </p>
    </div>
  );
};

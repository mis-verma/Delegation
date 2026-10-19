import type { ReactNode } from 'react';
import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover';
import { HOW_LINE_LABEL, HOW_LINE_ORDER, figureLabel, howCalculated, type ScoreFigure, type ScoreModule } from '../../lib/scoreLabels';

interface HowCalculatedProps {
  figure: ScoreFigure;
  module?: ScoreModule;
  label?: string;
}

interface HintPopoverProps {
  label: string;
  children: ReactNode;
}

export const HintPopover = ({ label, children }: HintPopoverProps) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        aria-label={label}
        className="relative inline-flex size-5 shrink-0 items-center justify-center rounded-full text-text-light transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:after:absolute pointer-coarse:after:-inset-3"
      >
        <CircleHelp className="size-4" aria-hidden="true" />
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" collisionPadding={16} className="flex w-[min(19rem,calc(100vw-2rem))] flex-col gap-2 p-3 t-meta leading-relaxed text-text-secondary">
      {children}
    </PopoverContent>
  </Popover>
);

export const HowCalculated = ({ figure, module, label }: HowCalculatedProps) => {
  const name = figureLabel(figure, module);
  const lines = howCalculated(figure, module);
  return (
    <HintPopover label={label ?? `How is ${name} calculated`}>
      <p className="t-card font-display font-bold text-text">{name}</p>
      {HOW_LINE_ORDER.map((k) => (
        <p key={k}>
          <span className="font-semibold text-text">{HOW_LINE_LABEL[k]}: </span>
          {lines[k]}
        </p>
      ))}
    </HintPopover>
  );
};

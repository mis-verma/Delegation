import { useEffect, useRef, type ReactNode } from 'react';

interface BuilderStepFrameProps {
  stepIndex: number;
  title: string;
  description?: string;
  children: ReactNode;
}

export const BuilderStepFrame = ({ stepIndex, title, description, children }: BuilderStepFrameProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only move focus to the heading when it would help: not when a field in this step already took
    // it (the name field's autoFocus), and not on the very first load, where nothing is focused yet
    // and the page should simply start at the top.
    const active = document.activeElement;
    if (!active || active === document.body || frameRef.current?.contains(active)) return;
    headingRef.current?.focus();
  }, [stepIndex]);

  return (
    <div ref={frameRef} className="flex flex-col gap-4 sm:gap-6">
      <div className="sr-only sm:not-sr-only flex flex-col gap-1">
        <h2 ref={headingRef} tabIndex={-1} className="font-display t-section font-bold text-text outline-none">
          {title}
        </h2>
        {/* Desktop-only: on a phone the step name plus the stepper above already say where you are. */}
        {description && <p className="hidden sm:block text-sm font-display text-text-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
};

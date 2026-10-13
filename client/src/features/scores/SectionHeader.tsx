import type { ReactNode } from 'react';

interface SectionHeaderProps {
  /** For aria-labelledby on the section. */
  id?: string;
  title: ReactNode;
  /** A page block ("section", t-section) or the title of a card inside one ("card", t-card). */
  level?: 'section' | 'card';
  /** A "?" (HowCalculated) that sits right after the title. */
  hint?: ReactNode;
  /** One line under the title. Desktop only: on a phone the numbers come first. */
  description?: ReactNode;
  /** Right-aligned: period badge, updating note, export. Always in this order, export last. */
  actions?: ReactNode;
}

/**
 * The one header every score card and block uses: title on the left (with its optional "?"), the actions
 * right-aligned on the same line, wrapping under the title on a narrow screen instead of squeezing it.
 */
export const SectionHeader = ({ id, title, level = 'section', hint, description, actions }: SectionHeaderProps) => {
  const Heading = level === 'section' ? 'h2' : 'h3';
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <Heading id={id} className={level === 'section' ? 't-section font-display font-bold text-text' : 't-card font-display font-bold text-text'}>
            {title}
          </Heading>
          {hint}
        </div>
        {description && <p className="hidden t-meta text-text-muted sm:block">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
};

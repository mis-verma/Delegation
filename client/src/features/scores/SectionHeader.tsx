import type { ReactNode } from 'react';

interface SectionHeaderProps {
  id?: string;
  title: ReactNode;
  level?: 'section' | 'card';
  hint?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

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

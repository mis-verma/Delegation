import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { GradientIconTile } from '../gradientIconTile';

interface PageHeaderProps {
  icon: LucideIcon;
  title: string;
  /** Shown from the sm breakpoint up: a glance screen on a phone keeps just the title. */
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons). Wraps under the title on a narrow screen. */
  actions?: ReactNode;
}

// The one page header every admin and checklist screen uses: gradient icon tile, title, optional
// subtitle, optional actions. Replaces five hand-built variants with different sizes and tiles.
export const PageHeader = ({ icon, title, subtitle, actions }: PageHeaderProps) => (
  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
    <div className="flex items-center gap-3 min-w-0 flex-1 basis-80">
      <GradientIconTile icon={icon} />
      <div className="flex flex-col gap-0.5 min-w-0">
        <h1 className="text-xl sm:text-2xl font-display font-bold tracking-tight text-text">{title}</h1>
        {subtitle && <p className="hidden sm:block text-sm font-display text-text-muted max-w-2xl">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
  </div>
);

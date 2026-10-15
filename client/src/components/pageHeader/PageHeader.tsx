import { useContext, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPageLabel } from '../../lib/pageLabels';
import { GradientIconTile } from '../gradientIconTile';
import { PageHeaderTitleContext } from './pageHeaderContext';

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
export const PageHeader = ({ icon, title, subtitle, actions }: PageHeaderProps) => {
  const showTitle = useContext(PageHeaderTitleContext);
  const { pathname } = useLocation();
  // The top bar (Header.tsx) shows this name on a phone for every page in the shared page-label list.
  const nameInTopBar = !!getPageLabel(pathname);
  // Inside the admin shell the title is kept for screen readers only, and only the actions (if any)
  // take up room. With no actions this renders nothing visible at all.
  if (!showTitle) {
    return actions ? (
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <h1 className="sr-only">{title}</h1>
        {actions}
      </div>
    ) : (
      <h1 className="sr-only">{title}</h1>
    );
  }
  return (
    <>
      {nameInTopBar && <h1 className="sr-only sm:hidden">{title}</h1>}
      {/* Phone, and the top bar already names this page: the big icon and title are skipped (they said the same
          word twice, one under the other, and cost about 100px), leaving only the actions, if any. */}
      <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', nameInTopBar && !actions && 'max-sm:hidden')}>
        <div className={cn('flex items-center gap-3 min-w-0 flex-1 basis-80', nameInTopBar && 'max-sm:hidden')}>
          <GradientIconTile icon={icon} />
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="t-title font-display font-bold tracking-tight text-text">{title}</h1>
            {subtitle && <p className="hidden sm:block text-sm font-display text-text-muted max-w-2xl">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </>
  );
};

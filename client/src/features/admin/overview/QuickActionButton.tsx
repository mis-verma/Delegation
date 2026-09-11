import { Link } from 'react-router';
import { ArrowUpRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface QuickActionButtonProps {
  to: string;
  icon: LucideIcon;
  label: string;
  description: string;
}

export const QuickActionButton = ({ to, icon: Icon, label, description }: QuickActionButtonProps) => (
  <Link
    to={to}
    className="group relative flex items-center gap-4 rounded-2xl border border-border/60 bg-surface p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary-300 focus-visible:outline-none focus-visible:border-primary-500 active:scale-[0.98]"
  >
    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-primary-600 ring-1 ring-primary-500/10 transition-all duration-300 group-hover:bg-primary-500/15 group-hover:ring-primary-500/20 dark:text-primary-400">
      <Icon size={19} strokeWidth={1.75} />
    </div>

    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-display font-medium text-text transition-colors duration-300 group-hover:text-primary-700 dark:group-hover:text-primary-400">
        {label}
      </p>
      <p className="truncate text-xs font-display text-text-muted">{description}</p>
    </div>

    <ArrowUpRight
      size={16}
      strokeWidth={2}
      className="shrink-0 text-text-muted/50 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary-600 dark:group-hover:text-primary-400"
    />
  </Link>
);

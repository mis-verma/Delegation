import type { LucideIcon } from 'lucide-react';
import { Sparkles } from 'lucide-react';
import { OrbitDecoration } from '../orbitDecoration';

interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Short bullet points teasing what's shipping — optional, keeps the page from feeling empty. */
  features?: string[];
}

// Full-bleed placeholder for a routed page that isn't built yet. Sits inside Dashboard's
// <Outlet>, which already gives it a flex-1 column to fill, so this just centers itself within
// that space rather than assuming viewport height (letting it work under both the plain Dashboard
// shell and any header/breadcrumb wrapper a future page might add above it).
export const ComingSoon = ({ icon: Icon, title, description, features }: ComingSoonProps) => (
  <div className="relative flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden px-4 py-16 text-center">
    <OrbitDecoration corner="top-left" tone="primary" className="hidden sm:block" />
    <OrbitDecoration corner="bottom-right" tone="coral" className="hidden sm:block" />

    <div className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 sm:size-20 dark:bg-primary-500/15 dark:text-primary-400">
      <Icon size={28} strokeWidth={1.75} className="sm:size-8" />
      <span className="absolute inset-0 rounded-2xl border border-primary-400/30 animate-ping" />
    </div>

    <div className="flex flex-col gap-2">
      <span className="inline-flex items-center justify-center gap-1.5 self-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1 t-meta font-bold uppercase tracking-wider text-primary-700 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-400">
        <Sparkles size={12} strokeWidth={2.5} />
        Coming soon
      </span>
      <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">{title}</h1>
      <p className="max-w-md self-center text-sm text-text-muted sm:text-base">{description}</p>
    </div>

    {features && features.length > 0 && (
      <ul className="flex w-full max-w-md flex-col gap-2 text-left">
        {features.map((feature) => (
          <li
            key={feature}
            className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-surface px-4 py-2.5 text-sm text-text-secondary"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-primary-500" />
            {feature}
          </li>
        ))}
      </ul>
    )}
  </div>
);
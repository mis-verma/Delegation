import { useId } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BrandLogoProps {
  className?: string;
  showWordmark?: boolean;
  textClassName?: string;
  tagline?: boolean;
}

export const BrandLogo = ({ className = 'size-6', showWordmark = true, textClassName, tagline = false }: BrandLogoProps) => {
  const fill = `karya-fill-${useId().replace(/:/g, '')}`;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <svg
        viewBox="0 0 40 40"
        className={cn('shrink-0 drop-shadow-sm', className)}
        fill="none"
        role="img"
        aria-label={showWordmark ? undefined : 'KaryaOS'}
        aria-hidden={showWordmark ? true : undefined}
      >
        <defs>
          <linearGradient id={fill} x1="5" y1="36" x2="34" y2="5" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2563eb" />
            <stop offset="1" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        <circle cx="19.5" cy="20.5" r="16.5" fill={`url(#${fill})`} />
        <path d="M12.2 21.6l4.2 4.2 10.5-10.6" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="31.5" cy="9" r="4.4" fill="#22d3ee" strokeWidth="2" style={{ stroke: 'var(--color-surface)' }} />
      </svg>

      {showWordmark && (
        <span className="inline-flex min-w-0 flex-col justify-center gap-1 leading-none">
          <span className={cn('inline-flex items-baseline gap-1 leading-none', textClassName)}>
            <span className="font-display font-extrabold tracking-tight text-text">Karya</span>
            <span className="text-[0.75em] font-display font-medium text-vivid-sky-text dark:text-vivid-sky">OS</span>
          </span>
          {tagline && <span className="t-meta truncate text-text-muted">Work Operating System</span>}
        </span>
      )}
    </span>
  );
};

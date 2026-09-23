import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getInitials } from '../../lib/getInitials';
import { SIZE_CLASS } from './avatarSize';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  /** Renders a small presence dot at the bottom-right corner when set — leave undefined when
   *  presence isn't known/relevant here (most callers). Online = filled success green, offline =
   *  hollow so it doesn't read as an error/warning color, just "not right now." */
  online?: boolean;
}

const DOT_SIZE_CLASS: Record<keyof typeof SIZE_CLASS, string> = {
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3',
  xl: 'size-3.5',
};

// Shared photo-or-initials avatar — a real <img> when `src` is set, the same gradient-circle
// initials treatment every card in the app already used inline otherwise (see UserCard.tsx,
// AdminHeader.tsx) as the fallback, now in one place instead of reimplemented per component.
export const Avatar = ({ name, src, size = 'md', className, online }: AvatarProps) => {
  const image = src ? (
    <img
      src={src}
      alt={name}
      className={cn(
        'rounded-full object-cover shrink-0 shadow-sm ring-1 ring-primary-500/10',
        SIZE_CLASS[size],
        className
      )}
    />
  ) : (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-white font-display font-bold shrink-0 shadow-sm ring-1 ring-primary-500/10',
        SIZE_CLASS[size],
        className
      )}
    >
      {getInitials(name)}
    </div>
  );

  if (online === undefined) return image;

  return (
    <span className="relative inline-flex shrink-0">
      {image}
      <span
        aria-label={online ? 'Active now' : 'Not active'}
        className={cn(
          'absolute bottom-0 right-0 rounded-full ring-2 ring-surface',
          DOT_SIZE_CLASS[size],
          online ? 'bg-success' : 'bg-transparent border border-text-light/50',
        )}
      />
    </span>
  );
};

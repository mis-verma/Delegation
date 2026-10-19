import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Avatar } from './Avatar';
import { SIZE_CLASS } from './avatarSize';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AvatarStackProps {
  people: { name: string; src?: string | null }[];
  max?: number;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}

export const AvatarStack = ({ people, max = 4, size = 'sm', className }: AvatarStackProps) => {
  if (people.length === 0) return null;
  const shown = people.slice(0, max);
  const remaining = people.length - shown.length;

  return (
    <div className={cn('flex items-center -space-x-2', className)}>
      {shown.map((person, i) => (
        <Avatar key={i} name={person.name} src={person.src} size={size} className="ring-2 ring-surface" />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            'flex items-center justify-center rounded-full bg-surface-hover text-text-muted font-display font-bold shrink-0 ring-2 ring-surface',
            SIZE_CLASS[size]
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
};

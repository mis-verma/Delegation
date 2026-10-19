import type { LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SIZE_CONFIG = {
  sm: { 
    tile: 'size-10 rounded-xl', 
    icon: 20, 
    shadow: 'shadow-md shadow-primary-600/20 ring-1 ring-inset ring-white/20' 
  },
  md: { 
    tile: 'size-12 rounded-2xl', 
    icon: 24, 
    shadow: 'shadow-lg shadow-primary-600/25 ring-1 ring-inset ring-white/20' 
  },
  lg: { 
    tile: 'size-14 rounded-2xl', 
    icon: 28, 
    shadow: 'shadow-xl shadow-primary-600/30 ring-1 ring-inset ring-white/25' 
  },
} as const;

interface GradientIconTileProps {
  icon: LucideIcon;
  size?: keyof typeof SIZE_CONFIG;
  className?: string;
}

export const GradientIconTile = ({ icon: Icon, size = 'md', className }: GradientIconTileProps) => {
  const { tile, icon, shadow } = SIZE_CONFIG[size];
  
  return (
    <div
      className={cn(
        'flex items-center justify-center shrink-0 relative overflow-hidden',
        'bg-gradient-to-br from-primary-500 to-primary-600 text-white',
        tile,
        shadow,
        className
      )}
    >
      <Icon size={icon} strokeWidth={2.5} className="relative z-10" />
      
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none" />
    </div>
  );
};
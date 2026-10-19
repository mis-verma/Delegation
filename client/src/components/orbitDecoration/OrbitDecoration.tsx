import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface OrbitDecorationProps {
  corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  tone?: 'primary' | 'coral';
  className?: string;
}

const CORNER_CLASS: Record<OrbitDecorationProps['corner'], string> = {
  'top-left': '-top-16 -left-16',
  'top-right': '-top-16 -right-16',
  'bottom-left': '-bottom-16 -left-16',
  'bottom-right': '-bottom-16 -right-16',
};

export const OrbitDecoration = ({ corner, tone = 'primary', className }: OrbitDecorationProps) => {
  const outerRing = tone === 'coral' ? 'border-coral-200/40' : 'border-primary-200/40';
  const midRing = tone === 'coral' ? 'border-coral-200/60' : 'border-primary-200/60';
  const innerRing = tone === 'coral' ? 'border-coral-200/80 bg-coral-50/30' : 'border-primary-200/80 bg-primary-50/30';
  
  const dot = tone === 'coral' 
    ? 'bg-coral-500 shadow-md shadow-coral-500/40' 
    : 'bg-primary-500 shadow-md shadow-primary-500/40';

  return (
    <div 
      aria-hidden="true" 
      className={cn('absolute -z-10 w-56 h-56 pointer-events-none transition-opacity duration-700 opacity-80', CORNER_CLASS[corner], className)}
    >
      <div className={cn('absolute inset-0 rounded-full border', outerRing)} />
      
      <div className={cn('absolute inset-[22%] rounded-full border border-dashed opacity-80', midRing)} />
      
      <div className={cn('absolute inset-[44%] rounded-full border', innerRing)} />
      
      <div className="absolute inset-0 animate-orbit-slow">
        <span className={cn('absolute -top-1 left-1/2 -translate-x-1/2 size-2.5 rounded-full', dot)} />
      </div>
    </div>
  );
};
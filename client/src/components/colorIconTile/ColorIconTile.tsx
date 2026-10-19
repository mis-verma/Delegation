import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TILE_COLORS = ['bg-blue-500', 'bg-violet-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-sky-500', 'bg-rose-500'];

const tileColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length];
};

interface ColorIconTileProps {
  icon: LucideIcon;
  name: string;
  size?: 'md' | 'sm';
  className?: string;
}

export const ColorIconTile = ({ icon: Icon, name, size = 'md', className }: ColorIconTileProps) => (
  <span
    className={cn(
      'flex items-center justify-center shrink-0 text-white',
      size === 'sm' ? 'size-8 rounded-lg' : 'size-10 rounded-xl',
      tileColor(name),
      className,
    )}
  >
    <Icon className={size === 'sm' ? 'size-4' : 'size-5'} strokeWidth={2.25} aria-hidden />
  </span>
);

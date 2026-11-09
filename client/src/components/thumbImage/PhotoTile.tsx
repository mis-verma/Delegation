import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ThumbImage } from './ThumbImage';

interface PhotoTileProps {
  src: string;
  alt: string;
  onOpen: () => void;
  live?: boolean;
  width?: number;
  className?: string;
}

export const PhotoTile = ({ src, alt, onOpen, live = false, width = 160, className }: PhotoTileProps) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={live ? `Open ${alt}, taken with the camera` : `Open ${alt}`}
    className={cn(
      'relative aspect-square w-full cursor-zoom-in overflow-hidden rounded-md border border-border/60 bg-surface-hover outline-none',
      'transition-[border-color,transform] duration-150 ease-out hover:border-primary-400 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-primary-500/40',
      className,
    )}
  >
    <ThumbImage src={src} alt={alt} width={width} className="size-full object-cover" />
    {live && (
      <span className="pointer-events-none absolute bottom-0.5 left-0.5 flex size-4 items-center justify-center rounded bg-black/55 text-white" title="Taken with the camera" aria-hidden="true">
        <Camera size={10} />
      </span>
    )}
  </button>
);

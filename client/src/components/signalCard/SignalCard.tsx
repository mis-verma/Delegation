import { ArrowRight } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SignalCardProps {
  eyebrow: string;
  title: string;
  body: string;
  actionLabel: string;
  meta?: string;
  onAction?: () => void;
  className?: string;
}

export const SignalCard = ({ 
  eyebrow, 
  title, 
  body, 
  actionLabel, 
  meta, 
  onAction, 
  className 
}: SignalCardProps) => (
  <div
    className={cn(
      "group relative flex flex-col w-80 max-w-full p-6 sm:p-7 rounded-[1.5rem] overflow-hidden",
      "bg-primary-900 border border-primary-800/60 shadow-xl",
      "transition-all duration-400 ease-out hover:shadow-2xl hover:shadow-primary-900/40 hover:-translate-y-1 hover:border-primary-700/80",
      className
    )}
  >
    {/* Ambient Background Glow */}
    <div 
      aria-hidden="true" 
      className="absolute inset-0 bg-gradient-to-br from-primary-900/30 to-transparent pointer-events-none" 
    />
    <div 
      aria-hidden="true" 
      className="absolute -top-24 -left-24 size-64 bg-primary-500/20 rounded-full blur-3xl pointer-events-none transition-colors duration-500 group-hover:bg-primary-500/30" 
    />

    {/* Eyebrow Badge */}
    <span className="relative inline-flex items-center gap-2.5 self-start px-3 py-1.5 mb-5 rounded-full border border-primary-700/50 bg-primary-900/50 backdrop-blur-sm t-meta font-bold uppercase tracking-widest text-primary-300">
      <span className="size-1.5 rounded-full bg-primary-400 shadow-[0_0_8px_rgba(var(--color-primary-400),0.8)] animate-pulse" />
      {eyebrow}
    </span>

    {/* Content */}
    <h3 className="relative font-display text-xl sm:text-2xl font-bold leading-tight tracking-tight text-white mb-2.5">
      {title}
    </h3>

    <p className="relative text-sm leading-relaxed text-primary-100/70">
      {body}
    </p>

    {/* Footer Actions */}
    <div className="relative flex items-center justify-between gap-4 mt-8 pt-2">
      <button
        type="button"
        onClick={onAction}
        className={cn(
          "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-bold transition-all duration-200 cursor-pointer outline-none",
          "shadow-lg shadow-primary-600/20 hover:bg-primary-500 hover:shadow-primary-600/30 hover:-translate-y-0.5",
          "focus-visible:ring-4 focus-visible:ring-primary-500/50 active:scale-95 active:translate-y-0"
        )}
      >
        <span>{actionLabel}</span>
        <ArrowRight size={16} strokeWidth={2.5} className="transition-transform group-hover/btn:translate-x-0.5" />
      </button>

      {meta && (
        <span className="t-meta font-bold uppercase tracking-widest text-text-muted">
          {meta}
        </span>
      )}
    </div>
  </div>
);
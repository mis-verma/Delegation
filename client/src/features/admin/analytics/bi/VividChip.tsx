import { CircleAlert, CircleArrowDown, CircleCheck, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RateTone } from '../../../dashboard/dashboardDisplay';
import { TONE_SOLID, TONE_TEXT, TONE_WORD } from './vivid';

const ICON: Record<RateTone, LucideIcon | null> = { success: CircleCheck, warning: CircleAlert, danger: CircleArrowDown, neutral: null };
const BOX: Record<RateTone, string> = {
  success: 'border-vivid-green/40 bg-vivid-green/10',
  warning: 'border-vivid-sky/40 bg-vivid-sky/10',
  danger: 'border-vivid-red/40 bg-vivid-red/10',
  neutral: '',
};

export const VividChip = ({ tone, className }: { tone: RateTone; className?: string }) => {
  const Icon = ICON[tone];
  if (!Icon) return null;
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1 rounded-full border pl-1 pr-2 sm:h-7', BOX[tone], className)}>
      <span className={cn('flex size-4 items-center justify-center rounded-full text-white sm:size-5', TONE_SOLID[tone])} aria-hidden="true">
        <Icon className="size-2.5 sm:size-3" strokeWidth={2.75} />
      </span>
      <span className={cn('t-meta font-display font-semibold', TONE_TEXT[tone])}>{TONE_WORD[tone]}</span>
    </span>
  );
};

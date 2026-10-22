import { CircleAlert, CircleArrowDown, CircleCheck, type LucideIcon } from 'lucide-react';
import { IconChip } from '../../components/iconChip';
import type { RateTone } from './dashboardDisplay';
import { TONE_BG, TONE_WORD } from './scoreTone';

const TONE_ICON: Record<RateTone, LucideIcon | null> = { success: CircleCheck, warning: CircleAlert, danger: CircleArrowDown, neutral: null };

export const ToneChip = ({ tone, className }: { tone: RateTone; className?: string }) => {
  const Icon = TONE_ICON[tone];
  if (!Icon) return null;
  return <IconChip className={className} icon={Icon} tone={TONE_BG[tone]} label={TONE_WORD[tone]} />;
};

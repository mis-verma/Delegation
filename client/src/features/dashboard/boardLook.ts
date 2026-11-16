import type { BoardTone } from './boardTypes';

export const TONE: Record<BoardTone, { tile: string; value: string }> = {
  primary: { tile: 'bg-primary-600 dark:bg-primary-500', value: 'text-text' },
  danger: { tile: 'bg-danger', value: 'text-danger' },
  coral: { tile: 'bg-coral-500', value: 'text-text' },
  success: { tile: 'bg-success', value: 'text-text' },
};

export const pathOf = (href: string) => href.split('?')[0] ?? href;

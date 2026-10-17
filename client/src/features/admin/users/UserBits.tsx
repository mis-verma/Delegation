import { cn } from '@/lib/utils';

const CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border t-meta font-display font-semibold whitespace-nowrap';

export const DepartmentHeadChip = () => (
  <span className={cn(CHIP, 'border-primary-500/25 bg-primary-500/10 text-primary-700 dark:text-primary-300')}>Department head</span>
);

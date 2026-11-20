import type { ReactNode } from 'react';
import { ArrowDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, ChecklistProgressBar, PANEL_CLASS } from '../../../../components';
import { complianceToneClass, instanceProgressToneClass } from '../../checklistDisplay';
import { ChecklistSubmitButton, ChecklistSubmitError } from '../ChecklistSubmitBar';
import { FillProgressText } from './FillBottomBar';
import type { SubmitRun } from './useSubmitRun';
import type { FillProgress, SectionInfo } from './fillProgress';

interface FillAsideProps {
  progress: FillProgress;
  completion: number;
  isComplete: boolean;
  compliance: number | null;
  good: number;
  scored: number;
  sections: SectionInfo[];
  activeSection?: string | null;
  onPickSection?: (key: string) => void;
  late?: ReactNode;
  canSubmit: boolean;
  resubmit: boolean;
  submit: SubmitRun;
  onNext?: () => void;
  title: string;
  selfCompleteAll?: ReactNode;
}

export const FillAside = ({
  progress, completion, isComplete, compliance, good, scored, sections, activeSection, onPickSection, late, canSubmit, resubmit, submit, onNext, title, selfCompleteAll,
}: FillAsideProps) => (
  <aside aria-label={title} className="hidden lg:col-span-4 lg:flex lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100dvh-2rem)] flex-col gap-3 overflow-hidden">
    <div className={cn(PANEL_CLASS, 'flex shrink-0 flex-col gap-4 p-4')}>
      <div className="flex flex-col gap-1.5">
        <span className="t-meta font-display font-semibold text-text-muted">Completion</span>
        <span className="flex flex-wrap items-baseline gap-x-2.5 tabular-nums">
          <span className={cn('t-stat font-display font-bold leading-none', instanceProgressToneClass(progress.overdue, isComplete))}>{completion}%</span>
          <FillProgressText progress={progress} className="t-meta" />
        </span>
        <ChecklistProgressBar done={progress.done} total={progress.total} tone={progress.overdue ? 'danger' : 'auto'} bare />
      </div>
      {compliance !== null && (
        <div className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
          <span className="t-meta font-display font-semibold text-text-muted">Compliance</span>
          <span className="flex flex-wrap items-baseline gap-x-2.5 tabular-nums">
            <span className={cn('t-stat font-display font-bold leading-none', complianceToneClass(compliance))}>{compliance}%</span>
            <span className="t-meta font-medium text-text-secondary">{good} of {scored} answered well</span>
          </span>
          <ChecklistProgressBar done={good} total={scored} tone="auto" bare />
        </div>
      )}
      {late}
      <ChecklistSubmitError submit={submit} />
      {canSubmit ? (
        <ChecklistSubmitButton submit={submit} resubmit={resubmit} className="w-full" />
      ) : progress.left > 0 && onNext ? (
        <Button variant="outline" size="md" className="h-11 w-full font-display" onClick={onNext}>
          Next question
          <ArrowDown size={14} aria-hidden />
        </Button>
      ) : null}
      {selfCompleteAll}
    </div>

    {sections.length > 1 && (
      <nav aria-label="Sections" className={cn(PANEL_CLASS, 'flex min-h-0 flex-col gap-1 overflow-y-auto overscroll-contain p-2')}>
        <span className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface px-2.5 pb-1 pt-1 t-meta font-display font-bold text-text-muted">
          Sections
          <span className="tabular-nums">{sections.filter((s) => s.done === s.total).length}/{sections.length}</span>
        </span>
        {sections.map((section) => {
          const finished = section.done === section.total;
          const active = activeSection === section.key;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onPickSection?.(section.key)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex min-h-10 pointer-coarse:min-h-11 items-center gap-2 rounded-lg px-2.5 text-left outline-none transition-colors duration-150 ease-out cursor-pointer focus-visible:ring-2 focus-visible:ring-primary-500/40',
                active ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300' : 'text-text-secondary hover:bg-surface-hover hover:text-text',
              )}
            >
              {finished ? <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden /> : <span className="size-4 shrink-0 rounded-full border-2 border-border-hover" aria-hidden />}
              <span className="min-w-0 flex-1 t-meta font-display font-semibold line-clamp-2 leading-snug">{section.label}</span>
              <span className="shrink-0 t-meta font-display tabular-nums text-text-muted">{section.done}/{section.total}</span>
            </button>
          );
        })}
      </nav>
    )}
  </aside>
);

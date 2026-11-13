import { useMemo } from 'react';
import { AlarmClock, Camera, Check, ChevronRight, CornerUpLeft, Lock, PencilLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChecklistProgressBar } from '../../../components';
import { formatDateTime } from '../checklistDisplay';
import { isInCorrectionRound, sentBackAtOf } from './correctionRound';
import { isSendBackLocking } from './sendBackLock';
import type { ChecklistInstance, ChecklistInstanceItem } from '../../../api/checklistInstances';

interface SendBackSummaryProps {
  instance: ChecklistInstance;
  now: number;
  showLockNote: boolean;
  onGoTo: (item: ChecklistInstanceItem) => void;
}

const KindTag = ({ photoOnly }: { photoOnly: boolean }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 t-meta font-display font-semibold text-text-secondary ring-1 ring-inset ring-border/60">
    {photoOnly ? <Camera size={11} aria-hidden /> : <PencilLine size={11} aria-hidden />}
    {photoOnly ? 'New photo only' : 'Fix the answer'}
  </span>
);

export const SendBackSummary = ({ instance, now, showLockNote, onGoTo }: SendBackSummaryProps) => {
  const sentBackAt = sentBackAtOf(instance);
  const roundItems = useMemo(
    () => instance.items.filter((item) => isInCorrectionRound(item, sentBackAt)).sort((a, b) => a.order - b.order),
    [instance.items, sentBackAt],
  );
  const fixed = roundItems.filter((item) => item.isDone).length;
  const total = roundItems.length;
  const allFixed = total > 0 && fixed === total;
  const fixByMs = instance.sentBackFixBy ? Date.parse(instance.sentBackFixBy) : NaN;
  const fixBy = Number.isFinite(fixByMs) ? fixByMs : null;
  const late = fixBy !== null && now >= fixBy;
  const remark = instance.verificationNote?.trim();

  return (
    <section aria-labelledby="send-back-heading" className="flex flex-col overflow-hidden rounded-2xl border border-danger/30 bg-surface">
      <header className="flex items-start gap-3 border-b border-danger/15 bg-danger/[0.06] px-4 py-3.5 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger text-white" aria-hidden="true">
          <CornerUpLeft size={18} strokeWidth={2.25} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="send-back-heading" className="t-card font-display font-bold text-text">
            {allFixed ? 'Everything is fixed. Submit it again.' : 'Sent back for changes'}
          </h2>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 t-meta text-text-muted">
            {sentBackAt !== null && <span>Sent back {formatDateTime(new Date(sentBackAt).toISOString())}</span>}
            {fixBy !== null && (
              <span className={cn('inline-flex items-center gap-1 font-semibold', late ? 'text-danger' : 'text-text-secondary')}>
                <AlarmClock size={12} aria-hidden />
                {late ? 'Fix time has passed' : `Fix by ${formatDateTime(new Date(fixBy).toISOString())}`}
              </span>
            )}
          </p>
        </div>
        {total > 0 && (
          <span className={cn(
            'shrink-0 rounded-full px-2.5 py-1 t-meta font-display font-bold tabular-nums ring-1 ring-inset',
            allFixed ? 'bg-success/10 text-success-strong ring-success/30 dark:text-success' : 'bg-surface text-danger ring-danger/30',
          )}>
            {fixed} of {total} fixed
          </span>
        )}
      </header>

      <div className="flex flex-col gap-3 px-4 py-3.5 sm:px-5">
        {remark && (
          <figure className="flex flex-col gap-1 border-l-2 border-danger/50 pl-3">
            <figcaption className="t-meta font-display font-semibold text-text-muted">Reviewer's remark</figcaption>
            <blockquote className="t-card leading-snug text-text whitespace-pre-line break-words">{remark}</blockquote>
          </figure>
        )}

        {total > 0 && <ChecklistProgressBar done={fixed} total={total} tone="auto" bare thin />}

        {total > 0 ? (
          <ol className="flex flex-col gap-1.5" aria-label="Questions sent back">
            {roundItems.map((item, index) => {
              const done = item.isDone;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onGoTo(item)}
                    className={cn(
                      'group flex w-full cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-left outline-none transition-colors duration-150 ease-out active:scale-[0.995] focus-visible:ring-2 focus-visible:ring-primary-500/40',
                      done ? 'border-border/50 bg-surface-hover/30 hover:border-border-hover' : 'border-danger/25 bg-danger/[0.03] hover:border-danger/45',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full t-meta font-display font-bold tabular-nums',
                        done ? 'bg-success text-white' : 'bg-danger/12 text-danger',
                      )}
                      aria-hidden="true"
                    >
                      {done ? <Check size={13} strokeWidth={3} /> : index + 1}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className={cn('t-card font-display font-semibold leading-snug line-clamp-2 break-words', done ? 'text-text-muted' : 'text-text')}>{item.label}</span>
                      {!done && item.sendBackNote && (
                        <span className="t-meta leading-snug text-danger break-words">{item.sendBackNote}</span>
                      )}
                      <span className="flex flex-wrap items-center gap-1.5">
                        {done ? (
                          <span className="inline-flex items-center gap-1 t-meta font-display font-semibold text-success-strong dark:text-success">
                            <Check size={12} strokeWidth={2.75} aria-hidden />
                            Fixed
                          </span>
                        ) : (
                          <KindTag photoOnly={!!item.sendBackPhotoOnly} />
                        )}
                        {item.section && <span className="t-meta text-text-muted">{item.section}</span>}
                      </span>
                    </span>
                    <ChevronRight size={16} className="mt-1 shrink-0 text-text-muted transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
                    <span className="sr-only">{done ? 'Fixed. Go to this question' : 'Go to this question to fix it'}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="t-meta text-text-secondary">The whole checklist was sent back. Check your answers, fix what the reviewer asked, then submit it again.</p>
        )}

        {showLockNote && !allFixed && (
          <p className="flex items-start gap-1.5 t-meta font-medium text-text-secondary">
            <Lock size={12} className="mt-0.5 shrink-0" aria-hidden />
            {isSendBackLocking(instance.sentBackAt, now)
              ? 'Your other checklists stay locked until this is fixed.'
              : 'Fix it soon, or your other checklists will lock.'}
          </p>
        )}
      </div>
    </section>
  );
};

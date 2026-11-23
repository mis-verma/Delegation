import { useMemo, useState } from 'react';
import { AlertTriangle, Camera, Check, CheckCircle2, Flag, Minus, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Modal } from '../../components';
import { itemFlags } from '../checklist/instance/reviewFlags';
import { answerText } from '../checklist/instance/answerText';
import type { ItemRemark } from './decisionRequests';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';

const REMARK_MAX = 1000;

interface Look {
  icon: LucideIcon;
  tile: string;
  title: string;
}

/** One row per outcome, read once per question, so the list needs no branching to render. */
const LOOK: Record<'critical' | 'wrong' | 'noPhoto' | 'skipped' | 'ok', Look> = {
  critical: { icon: Flag, tile: 'bg-danger/12 text-danger', title: 'Critical answer failed' },
  wrong: { icon: AlertTriangle, tile: 'bg-warning/15 text-warning', title: 'Wrong answer' },
  noPhoto: { icon: Camera, tile: 'bg-danger/12 text-danger', title: 'Photos missing' },
  skipped: { icon: Minus, tile: 'bg-border/60 text-text-muted', title: 'Not answered' },
  ok: { icon: Check, tile: 'bg-success/15 text-success', title: 'Answered' },
};

const lookFor = (item: ChecklistInstanceItem): Look => {
  const f = itemFlags(item);
  if (f.criticalFailed) return LOOK.critical;
  if (f.bad) return LOOK.wrong;
  if (f.missingPhotos) return LOOK.noPhoto;
  if (!item.isDone && !item.isNotApplicable) return LOOK.skipped;
  return LOOK.ok;
};

const shortAnswer = (item: ChecklistInstanceItem): string => {
  if (item.isNotApplicable) return 'N/A';
  if (!item.isDone) return 'Not done';
  return answerText(item)?.replace(/^(Answered:?|Entered|Picked|Rated)\s+/, '') || 'Done';
};

interface ApprovalRemarksDialogProps {
  open: boolean;
  title: string;
  items: readonly ChecklistInstanceItem[];
  approveLabel: string;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (itemRemarks: ItemRemark[]) => void;
}

export const ApprovalRemarksDialog = ({ open, title, items, approveLabel, busy = false, onClose, onConfirm }: ApprovalRemarksDialogProps) => {
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const ordered = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);
  const flagged = useMemo(() => ordered.filter((i) => lookFor(i) !== LOOK.ok).length, [ordered]);
  const written = useMemo(
    () => Object.entries(remarks).flatMap(([itemId, remark]) => (remark.trim() ? [{ itemId, remark: remark.trim() }] : [])),
    [remarks],
  );

  const close = () => {
    if (busy) return;
    setRemarks({});
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      size="2xl"
      icon={<CheckCircle2 className="size-5" />}
      title={approveLabel}
      description={title}
      contentClassName="max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:rounded-none"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="t-meta font-display text-text-muted">
            {written.length === 0
              ? 'Remarks are optional. Leave them blank to approve as it is.'
              : `${written.length} ${written.length === 1 ? 'remark' : 'remarks'} will be saved with your approval.`}
          </p>
          <span className="flex items-center gap-2">
            <Button variant="ghost" onClick={close} disabled={busy}>Cancel</Button>
            <Button onClick={() => onConfirm(written)} isLoading={busy} className="bg-success-strong text-white hover:bg-success-strong/90 hover:text-white">
              {!busy && <Check size={15} strokeWidth={2.75} aria-hidden />}
              {approveLabel}
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-x-2 t-meta font-display font-semibold text-text-secondary">
          <span className="tabular-nums">{ordered.length} {ordered.length === 1 ? 'question' : 'questions'}</span>
          {flagged > 0 && (
            <span className="inline-flex items-center gap-1 text-danger tabular-nums">
              <AlertTriangle className="size-3.5" aria-hidden />
              {flagged} worth a look
            </span>
          )}
        </p>

        <ul className="flex flex-col gap-2">
          {ordered.map((item, index) => {
            const look = lookFor(item);
            const Icon = look.icon;
            const value = remarks[item.id] ?? '';
            const fieldId = `approval-remark-${item.id}`;
            return (
              <li key={item.id} className="flex min-w-0 gap-2.5 rounded-xl border border-border/60 bg-surface-hover/25 p-2.5">
                <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg', look.tile)} title={look.title} aria-hidden="true">
                  <Icon className="size-3.5" strokeWidth={2.5} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <label htmlFor={fieldId} className="t-meta font-display font-semibold leading-snug text-text">
                    <span className="text-text-muted tabular-nums">{index + 1}. </span>
                    {item.label}
                  </label>
                  <span className="flex flex-wrap items-center gap-x-2 t-meta font-display text-text-secondary">
                    <span className="font-semibold">{shortAnswer(item)}</span>
                    {look !== LOOK.ok && <span className="text-text-muted">· {look.title}</span>}
                  </span>
                  <input
                    id={fieldId}
                    type="text"
                    value={value}
                    maxLength={REMARK_MAX}
                    onChange={(e) => setRemarks((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Remark for this question (optional)"
                    aria-label={`Remark for: ${item.label}`}
                    className="h-11 w-full rounded-lg border border-border bg-surface px-3 text-base font-display text-text outline-none transition-colors duration-150 placeholder:text-text-light hover:border-border-hover focus:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/30 sm:h-9 sm:text-sm sm:pointer-coarse:h-11"
                  />
                </span>
                {value.trim().length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRemarks((prev) => ({ ...prev, [item.id]: '' }))}
                    aria-label={`Clear the remark for: ${item.label}`}
                    title="Clear"
                    className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
};

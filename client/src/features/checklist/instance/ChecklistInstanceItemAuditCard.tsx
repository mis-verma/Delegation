import { memo, useId, useState, type ReactNode } from 'react';
import { Ban, Camera, Check, CheckCheck, ImageUp, RotateCcw, X } from 'lucide-react';
import { Button, ChecklistProgressBar, Textarea } from '../../../components';
import { Badge } from '../../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { cn } from '@/lib/utils';
import { avatarColorClass } from '../../../lib/avatarColors';
import { getInitials } from '../../../lib/getInitials';
import {
  useSetChecklistInstanceItemSubmissionDoneMutation,
  useUpdateChecklistInstanceItemSubmissionAccessoriesMutation,
  useUpdateChecklistInstanceItemSubmissionRemarksMutation,
  useUploadChecklistInstanceItemSubmissionImagesMutation,
  useDeleteChecklistInstanceItemSubmissionImageMutation,
  useStoresQuery,
} from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { EvidenceThumb } from './EvidenceThumb';
import { CaptureButton, UploadingHint } from './CaptureButton';
import { useCanReopen } from './useCanReopen';
import { formatDateTime } from '../checklistDisplay';
import type {
  ChecklistInstanceItem,
  ChecklistInstanceItemSubmission,
  ChecklistInstanceItemSubmissionAccessory,
} from '../../../api/checklistInstances';
import type { CaptureMethod } from '../../../api/ticket';

interface ChecklistInstanceItemAuditCardProps {
  item:           ChecklistInstanceItem;
  instanceId:     string;
  /** Same rule as every other item type — whoever's assigned this checklist (or ADMIN/PC) can
   *  fill it in. One field auditor works through everyone on this list themselves; a row here
   *  isn't locked to whichever account happens to share that row's name. */
  canWork:        boolean;
  currentUserId?: string;
  isLocked:       boolean;
}

const personName = (submission: ChecklistInstanceItemSubmission) => {
  const name = `${submission.userId?.firstName ?? ''} ${submission.userId?.lastName ?? ''}`.trim() || 'Unknown person';
  return submission.userId?.isActive === false ? `${name} (left)` : name;
};

// Pick a person, then fill in just their row. An auditor walks the floor one person at a time, so
// the card shows one person's checklist at a time too, and moves on by itself after each Submit.
export const ChecklistInstanceItemAuditCard = memo(function ChecklistInstanceItemAuditCard({ item, instanceId, canWork, currentUserId, isLocked }: ChecklistInstanceItemAuditCardProps) {
  const pickerLabelId = useId();
  const { data: stores } = useStoresQuery();
  const storeName = (id: string | null) => (id ? stores?.find(s => s.id === id)?.name ?? null : null);

  const submissions = item.submissions ?? [];
  const submittedCount = submissions.filter(s => s.isDone).length;
  const interactive = canWork && !isLocked;

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const own = submissions.find(s => s.userId?.id === currentUserId && !s.isDone);
    return (own ?? submissions.find(s => !s.isDone) ?? submissions[0])?.id ?? null;
  });
  const selected = submissions.find(s => s.id === selectedId) ?? submissions[0] ?? null;

  // Next person still waiting, searching forward from the one just submitted and wrapping round —
  // the refetch that marks it done hasn't landed yet, so it's skipped by position, not by isDone.
  const goToNextPending = (submittedId: string) => {
    const at = submissions.findIndex(s => s.id === submittedId);
    const next = [...submissions.slice(at + 1), ...submissions.slice(0, at)].find(s => !s.isDone);
    if (next) setSelectedId(next.id);
  };

  return (
    <ItemCardShell isLocked={isLocked} className="gap-4">
      <ChecklistItemCardHeader
        item={item}
        interactive={false}
        subtitle={submissions.length > 0 && <AuditProgress done={submittedCount} total={submissions.length} />}
      />

      {submissions.length === 0 ? (
        <p className="text-sm text-text-muted">
          Nobody to audit yet. Add people under "Who gets audited?" in the checklist builder.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p id={pickerLabelId} className="text-xs font-semibold text-text-secondary">Select a person</p>
            <div role="group" aria-labelledby={pickerLabelId} className="flex flex-wrap gap-2">
              {submissions.map(submission => (
                <PersonChip
                  key={submission.id}
                  name={personName(submission)}
                  done={submission.isDone}
                  notApplicable={submission.isNotApplicable}
                  active={submission.id === selected?.id}
                  isMe={!!currentUserId && submission.userId?.id === currentUserId}
                  onSelect={() => setSelectedId(submission.id)}
                />
              ))}
            </div>
          </div>

          {selected && (
            <SubmissionPanel
              key={selected.id}
              item={item}
              submission={selected}
              instanceId={instanceId}
              storeName={storeName(selected.userId?.storeId ?? null)}
              isMe={!!currentUserId && selected.userId?.id === currentUserId}
              interactive={interactive}
              onSubmitted={goToNextPending}
            />
          )}
        </>
      )}
    </ItemCardShell>
  );
});

const AuditProgress = ({ done, total }: { done: number; total: number }) => (
  <div className="flex items-center gap-2">
    <ChecklistProgressBar done={done} total={total} bare thin className="w-24 sm:w-32" />
    <span className="text-xs text-text-muted tabular-nums">{done} of {total} submitted</span>
  </div>
);

const PersonAvatar = ({ name, done, notApplicable = false, size }: { name: string; done: boolean; notApplicable?: boolean; size: 'chip' | 'panel' }) => {
  // At chip size a corner badge lands on top of the initials, so a finished person's chip swaps
  // its initials for the tick outright. The name sits right beside it, so nothing is lost. Someone
  // marked not applicable (absent, on leave) gets a muted "none" mark instead of the success tick.
  if (done && size === 'chip') {
    return (
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center size-8 sm:size-7 rounded-full shrink-0',
          notApplicable ? 'bg-surface-active text-text-muted' : 'bg-success text-white',
        )}
      >
        {notApplicable ? <Ban size={14} strokeWidth={2.5} /> : <Check size={14} strokeWidth={3} />}
      </span>
    );
  }
  return (
    <span className="relative shrink-0">
      <span
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-full font-bold text-white',
          avatarColorClass(name),
          size === 'chip' ? 'size-8 sm:size-7 text-[11px] sm:text-[10px]' : 'size-10 text-xs',
        )}
      >
        {getInitials(name)}
      </span>
      {done && (
        <span
          aria-hidden
          className={cn(
            'absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-4 rounded-full ring-2 ring-surface',
            notApplicable ? 'bg-surface-active text-text-muted' : 'bg-success text-white',
          )}
        >
          {notApplicable ? <Ban size={10} strokeWidth={3} /> : <Check size={10} strokeWidth={3.5} />}
        </span>
      )}
    </span>
  );
};

// Same selected/unselected vocabulary as OptionsSheet's ChoiceChip, minus its trailing tick: here a
// tick already means "submitted" (the avatar badge), so selection is carried by border and tint.
const PersonChip = ({ name, done, notApplicable, active, isMe, onSelect }: {
  name: string; done: boolean; notApplicable: boolean; active: boolean; isMe: boolean; onSelect: () => void;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onSelect}
    title={name}
    className={cn(
      'inline-flex items-center gap-2 h-11 sm:h-9 pl-1 pr-3.5 rounded-full border text-sm sm:text-xs font-semibold',
      'transition-[background-color,border-color,color,transform] duration-150 ease-out cursor-pointer outline-none',
      'focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97] [-webkit-tap-highlight-color:transparent]',
      active
        ? 'border-primary-600 dark:border-primary-400 bg-primary-500/10 dark:bg-primary-500/15 text-primary-800 dark:text-primary-100'
        : done
          ? notApplicable
            ? 'border-border/60 bg-surface text-text-muted hover:border-border-hover'
            : 'border-success/40 bg-surface text-text-secondary hover:border-success/70'
          : 'border-border/60 bg-surface text-text-secondary hover:border-primary-400/60',
    )}
  >
    <PersonAvatar name={name} done={done} notApplicable={notApplicable} size="chip" />
    <span className="truncate max-w-[9rem]">{name}</span>
    {isMe && <span className="font-medium opacity-75">(You)</span>}
    {done && <span className="sr-only">{notApplicable ? ', not applicable' : ', submitted'}</span>}
  </button>
);

// Label on the left in the card's secondary text tone, an optional count beside it, and an
// optional action on the right. The fixed min height keeps rows with and without an action level.
const SectionHeader = ({ label, meta, action }: { label: string; meta?: ReactNode; action?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 min-h-8">
    <p className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
      {label}
      {meta && <span className="flex items-center gap-1 font-medium text-text-muted tabular-nums">{meta}</span>}
    </p>
    {action}
  </div>
);

// Also used read-only by ChecklistHistory, so a past result is drawn exactly the way
// the auditor saw it.
export const AccessoryTile = ({ name, checked, missing, interactive, onToggle }: {
  name: string; checked: boolean; missing: boolean; interactive: boolean; onToggle: () => void;
}) => {
  const className = cn(
    'inline-flex items-center gap-2 h-11 sm:h-9 pl-2.5 pr-3.5 rounded-lg border text-sm sm:text-xs font-medium select-none',
    'transition-[background-color,border-color,color,transform] duration-150 ease-out [-webkit-tap-highlight-color:transparent]',
    checked
      ? 'border-success/50 bg-success/10 dark:bg-success/15 text-text'
      : missing
        ? 'border-danger/30 bg-surface text-text-secondary'
        : 'border-border/60 bg-surface text-text-secondary',
    interactive && 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 active:scale-[0.97]',
    interactive && !checked && 'hover:border-border-hover hover:bg-surface-hover',
  );
  const box = (
    <span
      aria-hidden
      className={cn(
        'flex items-center justify-center size-[18px] rounded-[5px] border shrink-0 transition-colors duration-150',
        checked ? 'bg-success border-success text-white' : missing ? 'border-danger/40 text-danger' : 'border-border-hover bg-surface',
      )}
    >
      {missing ? (
        <X size={11} strokeWidth={3} />
      ) : (
        <Check
          size={12}
          strokeWidth={3.25}
          className={cn('transition-transform duration-150 ease-out motion-reduce:transition-none', checked ? 'scale-100' : 'scale-0')}
        />
      )}
    </span>
  );

  if (!interactive) {
    return (
      <span className={className}>
        {box}
        {name}
        <span className="sr-only">{checked ? ', has it' : missing ? ', missing' : ', not checked yet'}</span>
      </span>
    );
  }
  return (
    <button type="button" aria-pressed={checked} onClick={onToggle} className={className}>
      {box}
      {name}
    </button>
  );
};

interface SubmissionPanelProps {
  item:        ChecklistInstanceItem;
  submission:  ChecklistInstanceItemSubmission;
  instanceId:  string;
  storeName:   string | null;
  isMe:        boolean;
  interactive: boolean;
  onSubmitted: (submissionId: string) => void;
}

const SubmissionPanel = ({ item, submission, instanceId, storeName, isMe, interactive, onSubmitted }: SubmissionPanelProps) => {
  const setDone = useSetChecklistInstanceItemSubmissionDoneMutation(instanceId);
  const updateAccessories = useUpdateChecklistInstanceItemSubmissionAccessoriesMutation(instanceId);
  const updateRemarks = useUpdateChecklistInstanceItemSubmissionRemarksMutation(instanceId);
  const uploadImages = useUploadChecklistInstanceItemSubmissionImagesMutation(instanceId);
  const deleteImage = useDeleteChecklistInstanceItemSubmissionImageMutation(instanceId);
  // A submitted person stays submitted: only an admin can reopen their row.
  const canReopen = useCanReopen();

  const [remarksDraft, setRemarksDraft] = useState(submission.remarks ?? '');
  const remarksDirty = remarksDraft !== (submission.remarks ?? '');
  // "Not applicable": this person can't be checked today (absent, on leave). Asks for the reason in
  // a pop-up, then counts them as submitted so the audit can still finish.
  const isNa = submission.isNotApplicable;
  const [naOpen, setNaOpen] = useState(false);
  const [naReason, setNaReason] = useState('');
  // Ticked instantly, on the tap — not after the round trip. The mutation still fires and saves
  // for real, but nobody should have to stare at a checkbox for half a second wondering if their
  // tap registered. Rolled back to the last known-good state only if the save actually fails.
  const [accessoriesDraft, setAccessoriesDraft] = useState(submission.accessories);

  const name = personName(submission);
  const editable = interactive && !submission.isDone;
  const images = submission.images ?? [];
  const qualifying = item.requiresLivePhoto ? images.filter(i => i.captureMethod === 'LIVE').length : images.length;
  const photosNeeded = Math.max(item.requiredImageCount - qualifying, 0);
  const checkedCount = accessoriesDraft.filter(a => a.checked).length;
  const allChecked = checkedCount === accessoriesDraft.length;

  const saveAccessories = (next: ChecklistInstanceItemSubmissionAccessory[]) => {
    setAccessoriesDraft(next);
    updateAccessories.mutate({ id: submission.id, accessories: next }, {
      onError: () => setAccessoriesDraft(submission.accessories),
    });
  };
  const toggleAccessory = (accessoryName: string) => {
    if (!editable) return;
    saveAccessories(accessoriesDraft.map(a => (a.name === accessoryName ? { ...a, checked: !a.checked } : a)));
  };
  // Most people pass most checks — tick everything in one tap, then untick whatever's missing.
  const tickAll = () => {
    if (!editable) return;
    saveAccessories(accessoriesDraft.map(a => ({ ...a, checked: true })));
  };

  const handleFiles = (files: FileList | null, captureMethod: CaptureMethod) => {
    if (!files || !files.length) return;
    uploadImages.mutate({ submissionId: submission.id, files: Array.from(files), captureMethod });
  };

  const saveRemarks = () => updateRemarks.mutate({ id: submission.id, remarks: remarksDraft.trim() || null });

  const submitting = setDone.isPending || updateRemarks.isPending;
  const handleSubmit = async () => {
    if (remarksDirty) {
      try {
        await updateRemarks.mutateAsync({ id: submission.id, remarks: remarksDraft.trim() || null });
      } catch {
        return;
      }
    }
    setDone.mutate({ id: submission.id, isDone: true }, { onSuccess: () => onSubmitted(submission.id) });
  };

  const openNa = () => {
    // Start from whatever is already typed in Remarks, so nothing has to be typed twice.
    setNaReason(remarksDraft.trim());
    setNaOpen(true);
  };
  const markNotApplicable = () => {
    const reason = naReason.trim();
    if (!reason) return;
    setDone.mutate(
      { id: submission.id, isDone: true, notApplicable: true, remarks: reason },
      { onSuccess: () => { setNaOpen(false); onSubmitted(submission.id); } },
    );
  };

  const error = uploadImages.error ?? setDone.error ?? updateRemarks.error;
  const errorText = error ? (error instanceof Error ? error.message : "Couldn't save that. Try again.") : null;

  const showPhotos = editable || images.length > 0 || item.requiredImageCount > 0;
  const liveWord = item.requiresLivePhoto ? 'live ' : '';

  return (
    <section
      aria-label={`Audit for ${name}`}
      className="flex flex-col gap-4 pt-4 border-t border-border/60 animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out"
    >
      <div className="flex items-center gap-3">
        <PersonAvatar name={name} done={submission.isDone} notApplicable={isNa} size="panel" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text truncate">
            {name}{isMe && <span className="font-medium text-text-muted"> (You)</span>}
          </p>
          {storeName && <p className="text-xs text-text-muted truncate">{storeName}</p>}
        </div>
        {submission.isDone && isNa ? (
          <Badge variant="neutral">
            <Ban strokeWidth={2.5} aria-hidden />
            Not applicable
          </Badge>
        ) : submission.isDone ? (
          <Badge variant="success" className="tabular-nums">
            <Check strokeWidth={3} aria-hidden />
            Submitted{submission.completedAt ? ` ${formatDateTime(submission.completedAt)}` : ''}
          </Badge>
        ) : !interactive ? (
          <Badge variant="neutral">Pending</Badge>
        ) : null}
      </div>

      {accessoriesDraft.length > 0 && !isNa && (
        <div className="flex flex-col gap-2">
          <SectionHeader
            label="What they have"
            meta={`${checkedCount}/${accessoriesDraft.length}`}
            action={editable && !allChecked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={tickAll}
                className="text-primary-600 dark:text-primary-300 hover:text-primary-700 dark:hover:text-primary-200 hover:bg-primary-500/10"
              >
                <CheckCheck size={14} aria-hidden />
                Tick all
              </Button>
            )}
          />
          <ul className="flex flex-wrap gap-2">
            {accessoriesDraft.map(a => (
              <li key={a.name}>
                <AccessoryTile
                  name={a.name}
                  checked={a.checked}
                  missing={submission.isDone && !a.checked}
                  interactive={editable}
                  onToggle={() => toggleAccessory(a.name)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {showPhotos && !isNa && (
        <div className="flex flex-col gap-2">
          <SectionHeader
            label="Photos"
            meta={item.requiredImageCount > 0 ? (
              <>
                {photosNeeded === 0 && <Check size={12} strokeWidth={3} className="text-success" aria-hidden />}
                {qualifying}/{item.requiredImageCount}{item.requiresLivePhoto ? ' · live only' : ''}
              </>
            ) : 'optional'}
          />
          {images.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {images.map(img => (
                <li key={img.id}>
                  <EvidenceThumb
                    image={img}
                    fallbackAlt={`Photo of ${name}`}
                    onDelete={editable ? deleteImage.mutate : undefined}
                    deleting={deleteImage.isPending}
                  />
                </li>
              ))}
            </ul>
          )}
          {editable && (
            <div className="flex flex-wrap items-center gap-2">
              <CaptureButton icon={Camera} label="Take photo" live accept="image/*" onFiles={files => handleFiles(files, 'LIVE')} />
              {/* A live-only question rejects gallery uploads server-side, so there's no Gallery button to fail. */}
              {!item.requiresLivePhoto && (
                <CaptureButton icon={ImageUp} label="Gallery" live={false} accept="image/*" onFiles={files => handleFiles(files, 'GALLERY')} />
              )}
              {uploadImages.isPending && <UploadingHint />}
            </div>
          )}
        </div>
      )}

      {editable ? (
        <div className="flex flex-col gap-2">
          <SectionHeader
            label="Remarks"
            action={remarksDirty && (
              <Button variant="ghost" size="sm" onClick={saveRemarks} isLoading={updateRemarks.isPending}>
                Save
              </Button>
            )}
          />
          <Textarea
            id={`remarks-${submission.id}`}
            label={`Remarks for ${name}`}
            labelClassName="sr-only"
            value={remarksDraft}
            onChange={e => setRemarksDraft(e.target.value)}
            placeholder="Were they present today? Note anything missing or out of place…"
            rows={2}
            className="min-h-[4.5rem] px-3 py-2.5 rounded-lg resize-y"
          />
        </div>
      ) : submission.remarks ? (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold text-text-secondary">{isNa ? 'Reason' : 'Remarks'}</p>
          <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">{submission.remarks}</p>
        </div>
      ) : null}

      {editable && (
        <div className="flex flex-col gap-2">
          <ItemError error={errorText} fallback="Couldn't save that. Try again." />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-2">
            {photosNeeded > 0 && (
              <p className="text-xs text-text-muted text-center sm:text-left sm:flex-1">
                Add {photosNeeded} more {liveWord}photo{photosNeeded === 1 ? '' : 's'} to submit.
              </p>
            )}
            <Button
              variant="outline"
              onClick={openNa}
              disabled={submitting}
              className="w-full sm:w-auto h-11 sm:h-10 border-dashed text-text-secondary"
            >
              <Ban size={14} aria-hidden />
              Not applicable
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={submitting}
              disabled={photosNeeded > 0}
              className="w-full sm:w-auto h-11 sm:h-10"
            >
              Submit
            </Button>
          </div>
        </div>
      )}

      <Dialog open={naOpen} onOpenChange={setNaOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Mark as not applicable</DialogTitle>
            <DialogDescription className="text-xs">{name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Textarea
              id={`na-reason-${submission.id}`}
              label="Say why they can't be checked today. They count as done and the reviewer sees your reason."
              labelClassName="font-medium"
              autoFocus
              value={naReason}
              onChange={e => setNaReason(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="e.g. On leave today"
              className="min-h-0 px-3 py-2 rounded-lg resize-none"
            />
            <ItemError error={errorText} fallback="Couldn't save that. Try again." />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button type="button" variant="primary" size="sm" onClick={markNotApplicable} disabled={!naReason.trim()} isLoading={setDone.isPending}>
              Mark not applicable
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {interactive && submission.isDone && canReopen && (
        <div className="flex flex-col sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => setDone.mutate({ id: submission.id, isDone: false })}
            isLoading={setDone.isPending}
            className="w-full sm:w-auto h-11 sm:h-10"
          >
            {!setDone.isPending && <RotateCcw size={14} aria-hidden />}
            Reopen
          </Button>
        </div>
      )}
    </section>
  );
};

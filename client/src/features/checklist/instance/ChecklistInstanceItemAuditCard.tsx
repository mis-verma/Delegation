import { memo, useEffect, useId, useRef, useState } from 'react';
import { Ban, Camera, Check, CheckCheck, ImageUp, RotateCcw, X } from 'lucide-react';
import { Button, ChecklistProgressBar, Textarea } from '../../../components';
import { Badge } from '../../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '../../../components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useSetChecklistInstanceItemSubmissionDoneMutation,
  useUpdateChecklistInstanceItemSubmissionAccessoriesMutation,
  useSetChecklistInstanceItemSubmissionDressTypeMutation,
  useUpdateChecklistInstanceItemSubmissionRemarksMutation,
  useUploadChecklistInstanceItemSubmissionImagesMutation,
  useDeleteChecklistInstanceItemSubmissionImageMutation,
  useStoresQuery,
} from '../hook';
import { ChecklistItemCardHeader } from './ChecklistItemCardHeader';
import { ItemCardShell } from './ItemCardShell';
import { ItemError } from './ItemError';
import { EvidenceThumb } from './EvidenceThumb';
import { UploadingHint } from './CaptureButton';
import { AuditAvatar, AuditPeopleList, AuditPersonPicker, AuditStatusChip } from './ChecklistAuditPeople';
import { auditStatus, dressTypeChoices, uniformLabel, type AuditPerson } from './ChecklistAuditHelpers';
import { AuditCaptureButton, AuditDressTypePicker, AuditSectionHeader, AuditTickRow, AuditUniformChip } from './ChecklistAuditTicks';
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

const firstName = (submission: ChecklistInstanceItemSubmission) => submission.userId?.firstName?.trim() || 'person';

// Pick a person, then fill in just their row. An auditor walks the floor one person at a time, so
// the card shows one person's checklist at a time too, and moves on by itself after each Submit.
// Phones get a single "who is open" button that opens a sheet; large screens get the list as a
// sticky column beside the open person.
export const ChecklistInstanceItemAuditCard = memo(function ChecklistInstanceItemAuditCard({ item, instanceId, canWork, currentUserId, isLocked }: ChecklistInstanceItemAuditCardProps) {
  const peopleLabelId = useId();
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

  // Next person still waiting, searching forward from the one given and wrapping round. For a
  // person just submitted the refetch that marks them done hasn't landed yet, so they are skipped
  // by position, not by isDone.
  const findNextPending = (fromId: string) => {
    const at = submissions.findIndex(s => s.id === fromId);
    return [...submissions.slice(at + 1), ...submissions.slice(0, at)].find(s => !s.isDone);
  };
  const goToNextPending = (fromId: string) => {
    const next = findNextPending(fromId);
    if (next) setSelectedId(next.id);
  };

  // A tall form leaves the page scrolled far down. When the checker moves on, bring the new
  // person's top back into view instead of landing them at the bottom of someone else's form.
  const detailRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  const selectedKey = selected?.id;
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const el = detailRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: 'start' });
  }, [selectedKey]);

  const people: AuditPerson[] = submissions.map(s => ({
    id:     s.id,
    name:   personName(s),
    isMe:   !!currentUserId && s.userId?.id === currentUserId,
    store:  storeName(s.userId?.storeId ?? null),
    status: auditStatus(s),
    dressType: uniformLabel(s),
  }));

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
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-x-5 lg:items-start">
          <div className="lg:hidden">
            <AuditPersonPicker people={people} selectedId={selected?.id ?? null} doneCount={submittedCount} onSelect={setSelectedId} />
          </div>
          <div
            role="group"
            aria-labelledby={peopleLabelId}
            className="hidden lg:flex lg:flex-col lg:gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-8rem)]"
          >
            <p id={peopleLabelId} className="text-xs font-semibold text-text-secondary">People</p>
            <AuditPeopleList people={people} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
          </div>

          <div ref={detailRef} className="min-w-0 scroll-mt-3 lg:pl-5 lg:border-l lg:border-border/60">
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
                onNext={findNextPending(selected.id) ? () => goToNextPending(selected.id) : undefined}
              />
            )}
          </div>
        </div>
      )}
    </ItemCardShell>
  );
});

const AuditProgress = ({ done, total }: { done: number; total: number }) => (
  <div className="flex items-center gap-2.5">
    <ChecklistProgressBar done={done} total={total} bare thin className="w-full max-w-48" />
    <span className="text-xs text-text-muted tabular-nums whitespace-nowrap">{done} of {total} checked</span>
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
  /** Jumps to the next person still waiting. Absent when everyone else is already done. */
  onNext?:     () => void;
}

const SubmissionPanel = ({ item, submission, instanceId, storeName, isMe, interactive, onSubmitted, onNext }: SubmissionPanelProps) => {
  const setDone = useSetChecklistInstanceItemSubmissionDoneMutation(instanceId);
  const updateAccessories = useUpdateChecklistInstanceItemSubmissionAccessoriesMutation(instanceId);
  const updateRemarks = useUpdateChecklistInstanceItemSubmissionRemarksMutation(instanceId);
  const setDressType = useSetChecklistInstanceItemSubmissionDressTypeMutation(instanceId);
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
  const uniform = uniformLabel(submission);
  const status = auditStatus(submission);
  const editable = interactive && !submission.isDone;
  const images = submission.images ?? [];
  const typeChoices = dressTypeChoices(item.dressTypeOptions, submission.userId?.gender);
  const typeId = submission.dressType?.id ?? null;
  const typeSwapping = setDressType.isPending;
  // The selector replaces the header chip while it can show the current type itself.
  const showTypePicker = editable && !submission.isNotApplicable && typeChoices.length > 0;
  const typeShownInPicker = showTypePicker && (typeId === null || typeChoices.some(o => o.id === typeId));
  const qualifying = item.requiresLivePhoto ? images.filter(i => i.captureMethod === 'LIVE').length : images.length;
  // Every checked person needs at least one photo as proof (the server enforces the same floor).
  const requiredPhotos = Math.max(1, item.requiredImageCount);
  const photosNeeded = Math.max(requiredPhotos - qualifying, 0);
  const checkedCount = accessoriesDraft.filter(a => a.checked).length;
  const allChecked = checkedCount === accessoriesDraft.length;

  const saveAccessories = (next: ChecklistInstanceItemSubmissionAccessory[]) => {
    setAccessoriesDraft(next);
    updateAccessories.mutate({ id: submission.id, accessories: next }, {
      onError: () => setAccessoriesDraft(submission.accessories),
    });
  };
  const pickDressType = (dressTypeId: string | null) => {
    if (!editable || typeSwapping) return;
    // The server swaps in the new type's list, all unticked; show it as soon as it lands.
    setDressType.mutate({ id: submission.id, dressTypeId }, {
      onSuccess: data => setAccessoriesDraft(data.accessories),
    });
  };
  const toggleAccessory = (accessoryName: string) => {
    if (!editable || typeSwapping) return;
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

  const showPhotos = editable || images.length > 0;
  const liveWord = item.requiresLivePhoto ? 'live ' : '';
  const unticked = accessoriesDraft.length - checkedCount;

  // What the Submit button is waiting on, said plainly. Only missing photos block the button (as
  // before); the rest is a heads-up so an untouched person isn't submitted by accident.
  const helper = photosNeeded > 0
    ? (qualifying === 0 && photosNeeded === 1
      ? `Add a ${liveWord}photo to submit.`
      : `Add ${photosNeeded} more ${liveWord}photo${photosNeeded === 1 ? '' : 's'} to submit.`)
    : accessoriesDraft.length > 0 && checkedCount === 0
      ? 'Nothing ticked yet. Tick the items, or mark them not applicable.'
      : unticked > 0
        ? `${unticked} not ticked. Those will be recorded as missing.`
        : '';

  // The action strip. On phones it sticks above the bottom nav so Submit stays under the thumb
  // however tall the form gets; from lg it is an ordinary row at the end of the panel.
  const actionBar = 'sticky z-10 bottom-[calc(4rem+env(safe-area-inset-bottom))] md:bottom-0 lg:static flex flex-col gap-2 bg-surface -mx-3.5 px-3.5 sm:-mx-4 sm:px-4 lg:mx-0 lg:px-0 py-3 border-t border-border/60 lg:border-t-0 lg:py-0';

  return (
    <section
      aria-label={`Audit for ${name}`}
      className="flex flex-col gap-4 animate-in fade-in duration-200 ease-out"
    >
      <div className="flex items-center gap-3 min-h-11">
        <AuditAvatar name={name} size="panel" status={status} />
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <p className="text-sm font-semibold leading-snug text-text break-words">
            {name}{isMe && <span className="font-medium text-text-muted"> (You)</span>}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {uniform && !typeShownInPicker && <AuditUniformChip label={uniform} />}
            {storeName && <span className="text-xs text-text-muted truncate">{storeName}</span>}
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
            ) : (
              <AuditStatusChip status={status} />
            )}
          </div>
        </div>
      </div>

      {showTypePicker && (
        <AuditDressTypePicker
          options={typeChoices}
          currentId={typeId}
          pendingId={setDressType.variables?.dressTypeId ?? null}
          pending={typeSwapping}
          disabled={updateAccessories.isPending}
          warn={checkedCount > 0 || images.length > 0}
          onPick={pickDressType}
        />
      )}

      {accessoriesDraft.length > 0 && !isNa && (
        <div className={cn('flex flex-col gap-2 transition-opacity duration-150', typeSwapping && 'opacity-50 pointer-events-none')} aria-busy={typeSwapping}>
          <AuditSectionHeader
            label="What they have"
            meta={`${checkedCount} of ${accessoriesDraft.length} ticked`}
            action={editable && !allChecked && (
              <Button
                variant="ghost"
                size="sm"
                onClick={tickAll}
                className="text-primary-600 dark:text-primary-300 hover:text-primary-700 dark:hover:text-primary-200 hover:bg-primary-500/10"
              >
                <CheckCheck size={16} aria-hidden />
                Select all
              </Button>
            )}
          />
          <ul role="group" aria-label={`What ${name} has`} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {accessoriesDraft.map(a => (
              <li key={a.name} className="flex">
                <AuditTickRow
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
        <div className="flex flex-col gap-2 max-w-2xl">
          <AuditSectionHeader
            label="Photos"
            meta={(
              <>
                {photosNeeded === 0 && <Check size={12} strokeWidth={3} className="text-success" aria-hidden />}
                Required: {qualifying} of {requiredPhotos}{item.requiresLivePhoto ? ', live only' : ''}
              </>
            )}
          />
          {images.length > 0 && (
            <ul className="grid grid-cols-3 sm:grid-cols-4 gap-x-3 gap-y-4 pt-1">
              {images.map(img => (
                <li key={img.id} className="flex justify-center">
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
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <AuditCaptureButton icon={Camera} label="Take photo" live accept="image/*" onFiles={files => handleFiles(files, 'LIVE')} />
                {/* A live-only question rejects gallery uploads server-side, so there's no Gallery button to fail. */}
                {!item.requiresLivePhoto && (
                  <AuditCaptureButton icon={ImageUp} label="Gallery" live={false} accept="image/*" onFiles={files => handleFiles(files, 'GALLERY')} />
                )}
              </div>
              {uploadImages.isPending && <UploadingHint />}
            </div>
          )}
        </div>
      )}

      {editable ? (
        <div className="flex flex-col gap-2 max-w-2xl">
          <AuditSectionHeader
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
            rows={3}
            className="min-h-[5.5rem] px-3 py-2.5 rounded-lg text-base resize-y"
          />
        </div>
      ) : submission.remarks ? (
        <div className="flex flex-col gap-1 max-w-2xl">
          <p className="text-xs font-semibold text-text-secondary">{isNa ? 'Reason' : 'Remarks'}</p>
          <p className="t-card sm:text-sm text-text-secondary whitespace-pre-wrap break-words">{submission.remarks}</p>
        </div>
      ) : null}

      {editable && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-border-hover px-3 py-2.5">
          <p className="text-sm sm:text-xs text-text-muted">Absent or on leave? You can skip this person.</p>
          <Button
            variant="outline"
            onClick={openNa}
            disabled={submitting}
            className="w-full sm:w-auto h-11 sm:h-9 text-text-secondary"
          >
            <Ban size={16} aria-hidden />
            Not applicable
          </Button>
        </div>
      )}

      {editable && (
        <div className={actionBar}>
          <ItemError error={errorText} fallback="Couldn't save that. Try again." />
          <p className="min-h-4 text-xs text-text-muted text-center sm:text-right" aria-live="polite">{helper}</p>
          <div className="flex sm:justify-end">
            <Button
              variant="primary"
              onClick={handleSubmit}
              isLoading={submitting}
              disabled={photosNeeded > 0}
              className="w-full sm:w-auto sm:min-w-44 h-12 sm:h-10 text-sm"
            >
              Submit {firstName(submission)}
            </Button>
          </div>
        </div>
      )}

      {submission.isDone && (onNext || (interactive && canReopen)) && (
        <div className={actionBar}>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {interactive && canReopen && (
              <Button
                variant="outline"
                onClick={() => setDone.mutate({ id: submission.id, isDone: false })}
                isLoading={setDone.isPending}
                className="w-full sm:w-auto h-12 sm:h-10"
              >
                {!setDone.isPending && <RotateCcw size={16} aria-hidden />}
                Reopen
              </Button>
            )}
            {onNext && (
              <Button variant="primary" onClick={onNext} className="w-full sm:w-auto sm:min-w-44 h-12 sm:h-10 text-sm">
                Next person
              </Button>
            )}
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
    </section>
  );
};

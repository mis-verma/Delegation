import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useBlocker, useSearchParams } from 'react-router';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowLeft, AlertCircle, ListChecks, ChevronLeft, ChevronRight, ClipboardX } from 'lucide-react';
import { Skeleton, GradientIconTile, Breadcrumbs, Button } from '../../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { ApiError } from '../../../../api/http';
import {
  useChecklistDefinitionQuery,
  useCreateChecklistDefinitionMutation,
  useUpdateChecklistDefinitionMutation,
  useAssignableUsersQuery,
} from '../../hook';
import { ChecklistDetailsFields } from '../form/ChecklistDetailsFields';
import { ImportFromTemplateField } from '../form/ImportFromTemplateField';
import { useChecklistTemplatesQuery } from '../../hook';
import { QuestionTypePalette } from './QuestionTypePalette';
import { isItemDraftComplete } from './ItemTypeConfigFields';
import { BuilderSchedulePanel, hasScheduleTimeMismatch } from './BuilderSchedulePanel';
import { BuilderAssignPanel } from './BuilderAssignPanel';
import { BuilderReviewersPanel } from './BuilderReviewersPanel';
import { BuilderStepper } from './wizard/BuilderStepper';
import { BuilderStepFrame } from './wizard/BuilderStepFrame';
import { BuilderReviewStep } from './wizard/BuilderReviewStep';
import { emptyItemDraft, type ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import { normalizeItemOrder, cloneItemDraft } from '../itemSections';
import { BuilderItemsList } from './BuilderItemsList';
import type {
  ChecklistDefinition, ChecklistRecurrence, ChecklistIcon,
  ChecklistDefinitionItem, CreateChecklistDefinitionItemPayload,
} from '../../../../api/checklistDefinitions';

const toItemDraft = (item: ChecklistDefinitionItem): ItemDraft => ({
  key: item.id,
  section: item.section,
  label: item.label,
  requiredImageCount: String(item.requiredImageCount),
  maxImageCount: item.maxImageCount != null ? String(item.maxImageCount) : '',
  requiresLivePhoto: item.requiresLivePhoto,
  itemType: item.itemType,
  auditUserIds: item.auditUserIds,
  accessories: item.accessories,
  accessoriesFemale: item.accessoriesFemale,
  accessoriesMale: item.accessoriesMale,
  numberEntryUnit: item.numberEntryUnit ?? '',
  numberEntryMin: item.numberEntryMin != null ? String(item.numberEntryMin) : '',
  numberEntryMax: item.numberEntryMax != null ? String(item.numberEntryMax) : '',
  ratingScale: item.ratingScale != null ? String(item.ratingScale) : '5',
  options: item.options,
  gpsTargetLat: item.gpsTargetLat != null ? String(item.gpsTargetLat) : '',
  gpsTargetLng: item.gpsTargetLng != null ? String(item.gpsTargetLng) : '',
  gpsRadiusMeters: item.gpsRadiusMeters != null ? String(item.gpsRadiusMeters) : '',
  qrExpectedValue: item.qrExpectedValue ?? '',
  cashExpectedAmount: item.cashExpectedAmount != null ? String(item.cashExpectedAmount) : '',
  yesActions: item.yesActions ?? [],
  noActions: item.noActions ?? [],
});

// "Morning check" becomes "Morning check (copy)" — trimmed so even a very long name still fits the
// 191-character limit.
const copiedChecklistName = (name: string) => `${name.slice(0, 191 - ' (copy)'.length).trimEnd()} (copy)`;

const SIGNATURE_LABELS: Record<string, string[]> = {
  SIGNATURE: ['Signature'],
  DUAL_SIGNATURE: ['Employee', 'Supervisor'],
};

const buildItemPayloads = (itemDrafts: ItemDraft[]): CreateChecklistDefinitionItemPayload[] =>
  itemDrafts
    .filter(d => d.label.trim())
    .map(d => ({
      // A loaded question's key IS its server id; a new or copied one has a random key the server
      // doesn't recognise and simply mints a fresh id for.
      id: d.key,
      label: d.label.trim(),
      section: d.section ?? undefined,
      requiredImageCount: Number(d.requiredImageCount) || 0,
      maxImageCount: d.maxImageCount ? Number(d.maxImageCount) : undefined,
      requiresLivePhoto: d.requiresLivePhoto,
      itemType: d.itemType,
      ...(d.itemType === 'AUDIT' ? {
        auditUserIds: d.auditUserIds,
        accessories: d.accessories,
        accessoriesFemale: d.accessoriesFemale,
        accessoriesMale: d.accessoriesMale,
      } : {}),
      ...(d.itemType === 'NUMBER_ENTRY' || d.itemType === 'CASH_TALLY' ? {
        numberEntryUnit: d.numberEntryUnit.trim() || undefined,
        numberEntryMin: d.numberEntryMin.trim() ? Number(d.numberEntryMin) : undefined,
        numberEntryMax: d.numberEntryMax.trim() ? Number(d.numberEntryMax) : undefined,
      } : {}),
      ...(d.itemType === 'RATING' ? { ratingScale: d.ratingScale.trim() ? Number(d.ratingScale) : undefined } : {}),
      ...(d.itemType === 'MULTIPLE_CHOICE' || d.itemType === 'DROPDOWN' ? { options: d.options } : {}),
      ...(d.itemType === 'GPS' ? {
        gpsTargetLat: d.gpsTargetLat.trim() ? Number(d.gpsTargetLat) : undefined,
        gpsTargetLng: d.gpsTargetLng.trim() ? Number(d.gpsTargetLng) : undefined,
        gpsRadiusMeters: d.gpsRadiusMeters.trim() ? Number(d.gpsRadiusMeters) : undefined,
      } : {}),
      ...(d.itemType === 'QR_SCAN' ? { qrExpectedValue: d.qrExpectedValue.trim() || undefined } : {}),
      ...(d.itemType === 'CASH_TALLY' ? { cashExpectedAmount: d.cashExpectedAmount.trim() ? Number(d.cashExpectedAmount) : undefined } : {}),
      ...(d.itemType === 'SIGNATURE' || d.itemType === 'DUAL_SIGNATURE' ? { signatureLabels: SIGNATURE_LABELS[d.itemType] } : {}),
      ...((d.yesActions.length || d.noActions.length) && (d.itemType === 'YES_NO' || d.itemType === 'PASS_FAIL') ? {
        yesActions: d.yesActions,
        noActions: d.noActions,
      } : {}),
    }));

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'items', label: 'Items' },
  { key: 'assign', label: 'Assign' },
  { key: 'reviewers', label: 'Reviewers' },
  { key: 'review', label: 'Review' },
] as const;

// Shown next to the disabled Next button so it's clear *why* it's blocked, not just that it is.
const STEP_BLOCK_REASON: Record<number, string> = {
  0: 'Give this checklist a name to continue.',
  1: "Pick a store and a start date, and make sure it opens before it cuts off — then you're good.",
  2: 'Add at least one finished item to continue.',
  3: 'Add at least one person to continue.',
};

export const ChecklistBuilder = () => {
  const { definitionId } = useParams();
  const isEditing = !!definitionId;
  const navigate = useNavigate();
  const shouldReduceMotion = useReducedMotion();
  // "Duplicate checklist" lands here as /builder?copyFrom=<id>: a NEW checklist, pre-filled with
  // another one's settings, questions, stores, people and schedule.
  const [searchParams] = useSearchParams();
  const copyFromId = isEditing ? '' : searchParams.get('copyFrom') ?? '';
  const isCopying = !!copyFromId;

  const { data: existing, isPending: isLoadingExisting, isError: loadError, error: loadErrorObj, refetch: refetchExisting } = useChecklistDefinitionQuery(definitionId ?? '');
  const isDeleted = loadErrorObj instanceof ApiError && loadErrorObj.status === 404;
  const { data: copySource, isPending: isLoadingCopy, isError: copyFailed, error: copyErrorObj, refetch: refetchCopy } = useChecklistDefinitionQuery(copyFromId);
  const copySourceDeleted = copyErrorObj instanceof ApiError && copyErrorObj.status === 404;
  const { data: templates } = useChecklistTemplatesQuery();
  const createDefinition = useCreateChecklistDefinitionMutation();
  const updateDefinition = useUpdateChecklistDefinitionMutation();
  const mutation = isEditing ? updateDefinition : createDefinition;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<ChecklistIcon>('store');
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [recurrence, setRecurrence] = useState<ChecklistRecurrence>('DAILY');
  const [startDate, setStartDate] = useState('');
  const [opensTime, setOpensTime] = useState('');
  const [cutoffTime, setCutoffTime] = useState('');
  // DAILY only — Mon–Sat by default (Sunday off), matching the server default for new checklists.
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>(DEFAULT_WORKING_WEEKDAYS);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  // Additive on top of the role-based verify rule — see ChecklistReviewersField.
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>([]);
  // Ordered list of section names the admin has created for this checklist (e.g. "Opening",
  // "Closing", "Operational") — items without a section render in an "Ungrouped" bucket instead.
  const [sections, setSections] = useState<string[]>([]);
  // Which section a newly-added item lands in — set by clicking a section pill in the items list.
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [step, setStep] = useState(() => (definitionId ? STEPS.length - 1 : 0));
  const [maxStepReached, setMaxStepReached] = useState(step);
  const [direction, setDirection] = useState<1 | -1>(1);

  const goToStep = (index: number) => {
    setDirection(index > step ? 1 : -1);
    setStep(index);
    setMaxStepReached(m => Math.max(m, index));
  };

  const [hydratedId, setHydratedId] = useState<string | undefined>(undefined);
  const [copiedFromId, setCopiedFromId] = useState<string | undefined>(undefined);
  // Captured once at hydrate time, not read live off `existing` at submit time — if a background
  // refetch (e.g. another admin's edit invalidating this query) pulls in a newer version while
  // this form is still open, submitting THAT version would defeat the whole conflict check: it'd
  // look like "nothing changed" even though this form's fields are now stale relative to it.
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>(undefined);

  // Unsaved-changes guard: a snapshot of every field this form can edit, taken once at hydrate
  // (or at the create-mode defaults) and refreshed after a successful save — compared each render
  // against the live field values below to answer "would leaving right now lose anything." A
  // plain JSON string rather than a field-by-field dirty flag per setter, since this form has ~13
  // independently-editable fields and marking each one's setter by hand is exactly the kind of
  // thing that quietly goes stale the next time a field is added.
  const snapshotKey = (f: {
    name: string; description: string; icon: ChecklistIcon; storeIds: string[]; recurrence: ChecklistRecurrence;
    startDate: string; opensTime: string; cutoffTime: string; activeWeekdays: number[]; assigneeIds: string[];
    reviewerIds: string[]; itemDrafts: ItemDraft[]; sections: string[];
  }) => JSON.stringify(f);
  type BuilderSnapshot = Parameters<typeof snapshotKey>[0];
  const [baseline, setBaseline] = useState(() => snapshotKey({
    name: '', description: '', icon: 'store', storeIds: [], recurrence: 'DAILY', startDate: '',
    opensTime: '', cutoffTime: '', activeWeekdays: DEFAULT_WORKING_WEEKDAYS, assigneeIds: [], reviewerIds: [], itemDrafts: [], sections: [],
  }));

  // Pre-fills every field from a saved checklist — to edit it, or as the starting point of a copy.
  // A copy gets a new name and fresh question ids; everything else is carried over as it is.
  const applyDefinition = (def: ChecklistDefinition, asCopy: boolean) => {
    const nextName = asCopy ? copiedChecklistName(def.name) : def.name;
    // Trimmed on the way in, not just on submit — a whitespace-only stored value would otherwise
    // render as "unchanged" blank text but silently turn into a real change (cleared to undefined)
    // the moment the admin saves anything else on this checklist.
    const nextDescription = def.description?.trim() ?? '';
    const weekdays = def.activeWeekdays ?? ALL_WEEKDAYS;
    const seenSections: string[] = [];
    for (const item of def.items) {
      if (item.section && !seenSections.includes(item.section)) seenSections.push(item.section);
    }
    // Re-normalized on load (not just after a drag) in case the stored order was ever written by
    // a path that doesn't guarantee same-section contiguity (e.g. a bulk import or direct API
    // call) — the builder and instance-detail views both assume items sharing a section sit
    // together.
    const hydratedItemDrafts = normalizeItemOrder(
      def.items.map((item) => (asCopy ? cloneItemDraft(toItemDraft(item)) : toItemDraft(item))),
      seenSections,
    );
    setName(nextName);
    setDescription(nextDescription);
    setIcon(def.icon);
    setStoreIds(def.storeIds);
    setRecurrence(def.recurrence);
    setStartDate(def.startDate.slice(0, 10));
    setOpensTime(def.opensTime ?? '');
    setCutoffTime(def.cutoffTime ?? '');
    setActiveWeekdays(weekdays);
    setAssigneeIds(def.assigneeIds);
    setReviewerIds(def.reviewerIds);
    setItemDrafts(hydratedItemDrafts);
    setSections(seenSections);
    // Built from the values computed above, NOT the state setters just called — those won't be
    // visible on `name`/`itemDrafts`/etc. until the next render, so snapshotting off the state
    // variables here would capture the PRE-hydrate (blank) values. A copy isn't "unsaved work"
    // either — leaving straight away loses nothing — so it starts clean, same as an edit.
    setBaseline(snapshotKey({
      name: nextName,
      description: nextDescription,
      icon: def.icon,
      storeIds: def.storeIds,
      recurrence: def.recurrence,
      startDate: def.startDate.slice(0, 10),
      opensTime: def.opensTime ?? '',
      cutoffTime: def.cutoffTime ?? '',
      activeWeekdays: weekdays,
      assigneeIds: def.assigneeIds,
      reviewerIds: def.reviewerIds,
      itemDrafts: hydratedItemDrafts,
      sections: seenSections,
    }));
  };

  if (existing && hydratedId !== existing.id) {
    setHydratedId(existing.id);
    setLoadedVersion(existing.version);
    applyDefinition(existing, false);
  }
  if (copySource && copiedFromId !== copySource.id) {
    setCopiedFromId(copySource.id);
    applyDefinition(copySource, true);
  }

  // Brand-new checklist only (a copy brings its own reviewers) — PC is the org's default reviewer, so a fresh checklist starts with every
  // PC-role user pre-picked instead of an empty reviewer list nobody remembers to fill in. Still
  // just a starting point: the maker can remove any of them or add a department's HOD from the
  // grouped picker below. Applied the same way `existing` hydrates above — a guarded state update
  // during render, not inside an effect — and folded into `baseline` too, so this doesn't itself
  // count as an unsaved change the moment the form opens.
  const [reviewerDefaultApplied, setReviewerDefaultApplied] = useState(false);
  const orgWideUsers = useAssignableUsersQuery(undefined, undefined, undefined, !isEditing && !isCopying);
  if (!isEditing && !isCopying && !reviewerDefaultApplied && orgWideUsers.data) {
    setReviewerDefaultApplied(true);
    const pcIds = orgWideUsers.data.filter(u => u.role === 'PC').map(u => u.id);
    if (pcIds.length && !reviewerIds.length) {
      setReviewerIds(pcIds);
      setBaseline(prev => snapshotKey({ ...(JSON.parse(prev) as BuilderSnapshot), reviewerIds: pcIds }));
    }
  }

  const isDirty = snapshotKey({
    name, description, icon, storeIds, recurrence, startDate, opensTime, cutoffTime, activeWeekdays,
    assigneeIds, reviewerIds, itemDrafts, sections,
  }) !== baseline;

  // Escape hatch for "I just saved, don't warn me on the way out" — handleSubmit's onSuccess
  // calls this before navigating so the guard below doesn't immediately re-fire on its own
  // redirect to the new/updated checklist's detail page.
  // The baseline update below only lands on the NEXT render, but onSuccess navigates in the same
  // tick — so the blocker still saw the form as dirty and popped "Discard unsaved changes?" right
  // after "Checklist created". A ref is read at navigation time, so it skips the guard immediately.
  const justSavedRef = useRef(false);
  const markClean = () => {
    justSavedRef.current = true;
    setBaseline(snapshotKey({
      name, description, icon, storeIds, recurrence, startDate, opensTime, cutoffTime, activeWeekdays,
      assigneeIds, reviewerIds, itemDrafts, sections,
    }));
  };

  const confirm = useConfirm();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && !justSavedRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let cancelled = false;
    (async () => {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: 'This checklist has changes that haven\'t been saved yet — leaving now will lose them.',
        confirmLabel: 'Discard changes',
        cancelLabel: 'Keep editing',
        variant: 'danger',
      });
      if (cancelled) return;
      if (ok) blocker.proceed();
      else blocker.reset();
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  // useBlocker only covers in-app navigation (Link clicks, navigate() calls, browser back/
  // forward within this SPA) — a real tab close or hard refresh bypasses the router entirely, so
  // this is the only way to warn for that case. The browser controls the prompt's own wording.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Identified by the draft's stable `key`, not its array position — an index captured in a
  // row's closure can point at the wrong item if the array is reordered (drag, another row's
  // removal) between render and click.
  const updateDraft = (key: string, patch: Partial<ItemDraft>) =>
    setItemDrafts(drafts => drafts.map(d => (d.key === key ? { ...d, ...patch } : d)));

  // Inserted via normalizeItemOrder rather than a plain append — appending to the end of the flat
  // array would land the new item after whichever section happens to be last in storage order,
  // not inside its own section's block, breaking the "same-section items are contiguous"
  // assumption every other view relies on.
  const addItem = (patch: Partial<ItemDraft>) =>
    // `section` goes last: the patch from AddQuestionModal is a whole draft carrying section: null,
    // which used to override the picked section and drop every new item into Ungrouped.
    setItemDrafts(drafts => normalizeItemOrder([...drafts, { ...emptyItemDraft(), ...patch, section: activeSection }], sections));

  const removeItem = (key: string) =>
    setItemDrafts(drafts => drafts.filter(d => d.key !== key));

  const handleImportTemplate = (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return;
    setItemDrafts(drafts => normalizeItemOrder([
      ...drafts.filter(d => d.label.trim()),
      ...template.items.map(item => ({
        ...emptyItemDraft(),
        label: item.label,
        requiredImageCount: String(item.requiredImageCount),
        maxImageCount: item.maxImageCount != null ? String(item.maxImageCount) : '',
        requiresLivePhoto: item.requiresLivePhoto,
      })),
    ], sections));

    // A recurring checklist assigns people at the whole-definition level, not per item (unlike a
    // Task/Ticket checklist item's own assigneeId) — so a template item's defaultAssigneeId has no
    // matching per-item field to land in here. Used to be silently dropped; now it seeds the
    // definition's assignee list instead, additive only (same convention as the department
    // bulk-select in ChecklistAssigneesField — never replaces an existing selection).
    const templateAssigneeIds = template.items.map(i => i.defaultAssigneeId).filter((id): id is string => !!id);
    if (templateAssigneeIds.length) {
      setAssigneeIds(prev => [...new Set([...prev, ...templateAssigneeIds])]);
    }
  };

  const items = buildItemPayloads(itemDrafts);
  const basicsValid = !!name.trim();
  const scheduleValid = storeIds.length > 0 && !!startDate && !hasScheduleTimeMismatch(opensTime, cutoffTime);
  // Every draft needs a real label, not just the ones with one already — a blank-label draft used
  // to be waved through here (on the theory that it was just an in-progress row), but every item
  // actually reaches itemDrafts via AddQuestionModal, which already requires a label before it
  // lets you add the item — so a blank label here only ever means an already-configured item had
  // its title accidentally cleared later, and buildItemPayloads silently drops it on submit.
  const itemsValid = items.length > 0 && itemDrafts.every(d => d.label.trim() && isItemDraftComplete(d));
  const assignValid = assigneeIds.length > 0;
  const sectionValidity = [basicsValid, scheduleValid, itemsValid, assignValid] as const;
  const canSubmit = sectionValidity.every(Boolean);
  const isStepValid = (index: number) => (index < sectionValidity.length ? sectionValidity[index] : true);

  const handleSubmit = () => {
    if (!canSubmit) return;
    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      icon,
      storeIds,
      recurrence,
      startDate: new Date(startDate).toISOString(),
      opensTime: opensTime || undefined,
      cutoffTime: cutoffTime || undefined,
      activeWeekdays: recurrence === 'DAILY' ? activeWeekdays : null,
      assigneeIds,
      reviewerIds: reviewerIds.length ? reviewerIds : undefined,
      // Role labels are retired — saving clears any old ones so cards stop showing them.
      assigneeRoles: [],
      items,
    };

    if (isEditing) {
      // loadedVersion is always set by this point — hydrate runs synchronously as soon as
      // `existing` loads, and the loading/error branches above return before this is reachable
      // while it's still unset. The guard is defensive, not an expected path.
      if (loadedVersion == null) return;
      updateDefinition.mutate({ id: definitionId!, payload: { ...payload, version: loadedVersion } }, {
        onSuccess: ({ definition }) => { markClean(); navigate(`/admin/scheduled-checklists/${definition.id}`); },
      });
    } else {
      createDefinition.mutate(payload, {
        onSuccess: (created) => { markClean(); navigate(`/admin/scheduled-checklists/${created.id}`); },
      });
    }
  };

  if ((isEditing && isLoadingExisting) || (isCopying && isLoadingCopy)) {
    return (
      <div className="flex flex-col gap-4 w-full max-w-5xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    );
  }

  // 404 means the checklist was actually deleted — retrying just repeats the same doomed request
  // (see lib/queryHelpers.ts's handleQueryRetry), so this gets its own message and a way back
  // instead of the generic "try refreshing" banner below, whose Retry can never succeed here.
  if ((isEditing && isDeleted) || (isCopying && copySourceDeleted)) {
    return (
      <div className="w-full max-w-5xl mx-auto p-4 sm:p-6 py-16 flex flex-col items-center gap-3 text-center">
        <span className="flex items-center justify-center size-12 rounded-lg border border-border/60 bg-muted/60 text-text-muted">
          <ClipboardX className="size-6" strokeWidth={2.25} />
        </span>
        <h1 className="text-base font-display font-bold text-text">This checklist was deleted</h1>
        <p className="text-sm font-display text-text-muted max-w-sm">
          {isCopying ? "There's nothing left to copy" : "There's nothing left here to edit"} — its run history is still on the Compliance Board if you need it.
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate('/admin/scheduled-checklists')}
          className="mt-1 gap-1.5 font-display"
        >
          <ArrowLeft size={13} />
          Back to checklists
        </Button>
      </div>
    );
  }

  if ((isEditing && (loadError || !existing)) || (isCopying && (copyFailed || !copySource))) {
    return (
      <div className="w-full max-w-5xl mx-auto p-4 sm:p-6">
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm font-display shadow-xs">
          <AlertCircle size={18} className="shrink-0" />
          <span className="flex-1">We couldn't load this checklist. Try refreshing, or come back in a bit.</span>
          <button
            type="button"
            onClick={() => (isEditing ? refetchExisting() : refetchCopy())}
            className="shrink-0 px-3 py-1.5 rounded-md text-xs font-display font-semibold border border-danger/30 hover:bg-danger/10 cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const stepContent = [
    <BuilderStepFrame key="basics" stepIndex={step} title="Basics" description="Give this checklist a name your team will recognize.">
      {/* Fields sit straight on the wizard card, like every other step — a second bordered card
          inside it (with a "Checklist Details" heading under the step's own "Basics") was a box
          in a box. */}
      <div className="flex flex-col gap-5 max-w-2xl">
        <ChecklistDetailsFields
          name={name}
          onNameChange={setName}
          description={description}
          onDescriptionChange={setDescription}
          icon={icon}
          onIconChange={setIcon}
        />
      </div>
    </BuilderStepFrame>,

    <BuilderStepFrame key="schedule" stepIndex={step} title="Schedule" description="Choose which stores run this checklist and how often.">
      <BuilderSchedulePanel
        storeIds={storeIds}
        onStoreIdsChange={setStoreIds}
        recurrence={recurrence}
        onRecurrenceChange={setRecurrence}
        startDate={startDate}
        onStartDateChange={setStartDate}
        opensTime={opensTime}
        onOpensTimeChange={setOpensTime}
        cutoffTime={cutoffTime}
        onCutoffTimeChange={setCutoffTime}
        activeWeekdays={activeWeekdays}
        onActiveWeekdaysChange={setActiveWeekdays}
      />
    </BuilderStepFrame>,

    <BuilderStepFrame key="items" stepIndex={step} title="Checklist Items" description="Add the steps your team needs to complete, in order.">
      <div className="flex flex-col gap-6">
        <ImportFromTemplateField templates={templates} onImport={handleImportTemplate} />
        <div className="grid grid-cols-1 lg:grid-cols-[19rem_1fr] gap-5 lg:gap-6 items-start">
          {/* Phones: questions first, the type grid after them — it used to sit on top and push
              every question below the fold. Desktop: a sticky sidebar next to the list. */}
          <div className="order-last lg:order-first rounded-2xl border border-border bg-surface p-4 lg:sticky lg:top-4">
            <QuestionTypePalette onAdd={addItem} storeIds={storeIds} />
          </div>

          <div className="flex flex-col gap-3 min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-display font-semibold text-text">
                Questions <span className="font-normal text-text-muted tabular-nums">· {itemDrafts.length}</span>
              </h3>
              {itemDrafts.length > 1 && (
                <span className="hidden sm:inline text-[11px] font-display text-text-muted">Drag to reorder</span>
              )}
            </div>

            <BuilderItemsList
              itemDrafts={itemDrafts}
              setItemDrafts={setItemDrafts}
              onUpdateDraft={updateDraft}
              onRemoveItem={removeItem}
              sections={sections}
              setSections={setSections}
              activeSection={activeSection}
              setActiveSection={setActiveSection}
              storeIds={storeIds}
            />
          </div>
        </div>
      </div>
    </BuilderStepFrame>,

    <BuilderStepFrame key="assign" stepIndex={step} title="Assign" description="Decide who's responsible for this checklist.">
      <BuilderAssignPanel
        storeIds={storeIds}
        assigneeIds={assigneeIds}
        onAssigneeIdsChange={setAssigneeIds}
      />
    </BuilderStepFrame>,

    <BuilderStepFrame key="reviewers" stepIndex={step} title="Reviewers" description="Pick who reviews a filled-in run and approves or sends it back — usually the department head or a PC.">
      <BuilderReviewersPanel
        storeIds={storeIds}
        reviewerIds={reviewerIds}
        onReviewerIdsChange={setReviewerIds}
      />
    </BuilderStepFrame>,

    <BuilderStepFrame key="review" stepIndex={step} title="Review & Create" description="Double-check everything below, then create the checklist.">
      <BuilderReviewStep
        name={name}
        description={description}
        storeIds={storeIds}
        recurrence={recurrence}
        startDate={startDate}
        opensTime={opensTime}
        cutoffTime={cutoffTime}
        activeWeekdays={activeWeekdays}
        itemDrafts={itemDrafts}
        assigneeIds={assigneeIds}
        reviewerIds={reviewerIds}
        sectionValidity={sectionValidity}
        onEditSection={goToStep}
        canSubmit={canSubmit}
        isSubmitting={mutation.isPending}
        isEditing={isEditing}
        onSubmit={handleSubmit}
        submitError={mutation.isError ? (mutation.error instanceof Error ? mutation.error.message : "Couldn't save this checklist. Try again.") : undefined}
      />
    </BuilderStepFrame>,
  ];

  const progressPercent = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto py-2 sm:py-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Admin', to: '/admin' },
          { label: 'Checklists', to: '/admin/scheduled-checklists' },
          { label: isEditing && existing ? existing.name : isCopying ? 'Duplicate checklist' : 'New checklist' },
          { label: STEPS[step].label },
        ]}
      />

      {/* Top Header */}
      <div className="flex items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
          <GradientIconTile icon={ListChecks} className="hidden sm:flex" />
          <div className="flex flex-col gap-0.5 min-w-0">
            <h1 className="font-display text-xl sm:text-2xl font-bold text-text tracking-tight leading-snug line-clamp-2">
              {isEditing ? `Editing: ${existing?.name}` : isCopying ? 'Duplicate checklist' : 'New Checklist'}
            </h1>
            <p className="hidden sm:block text-sm text-text-muted">
              {isEditing && existing
                ? `Version ${existing.version} · Live in ${existing.storeIds.length} store${existing.storeIds.length !== 1 ? 's' : ''}`
                : isCopying && copySource
                  ? `Copied from "${copySource.name}" — stores, people, schedule and every question. Give it a new name and assign it, then save.`
                  : 'Build a recurring checklist your team runs on a schedule.'}
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => navigate('/admin/scheduled-checklists')}
          className="font-display shrink-0"
          aria-label="Back to checklists"
        >
          <ArrowLeft size={13} />
          <span className="hidden sm:inline">Back to checklists</span>
        </Button>
      </div>

      {/* Main Wizard Card */}
      <div className="rounded-2xl border border-border bg-surface">
        {/* Stepper Header with Progress Bar */}
        <div className="flex flex-col gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-border/60 bg-muted/20 rounded-t-2xl">
          <BuilderStepper
            steps={STEPS}
            current={step}
            maxReached={maxStepReached}
            allUnlocked={isEditing || isCopying}
            isStepValid={isStepValid}
            onSelect={goToStep}
          />
          <div className="hidden sm:block h-1.5 w-full rounded-full bg-border/60 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary-600 via-primary-500 to-primary-400 transition-[width] duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Wizard Content Step */}
        <div className="p-4 sm:p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -24 }}
              transition={{ duration: shouldReduceMotion ? 0.05 : 0.2, ease: 'easeOut' }}
            >
              {stepContent[step]}
            </motion.div>
          </AnimatePresence>

          {/* Footer Navigation Bar */}
          <div className="flex items-center justify-between pt-4 sm:pt-6 mt-6 sm:mt-8 border-t border-border/60">
            {step > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => goToStep(step - 1)}
                className="font-display"
              >
                <ChevronLeft size={15} />
                <span>Back</span>
              </Button>
            ) : <span />}

            {step < STEPS.length - 1 && (
              <div className="flex flex-col items-end gap-1.5">
                {/* isStepValid, not a raw sectionValidity[step] index — sectionValidity only
                    covers the first 4 (required) steps; a step past that (Reviewers) has nothing
                    to validate and reads as undefined/always-valid rather than blocked. */}
                {!isStepValid(step) && (
                  <p className="text-[11px] font-display text-warning flex items-center gap-1">
                    <AlertCircle size={12} className="shrink-0" />
                    {STEP_BLOCK_REASON[step]}
                  </p>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => goToStep(step + 1)}
                  disabled={!isStepValid(step)}
                  className="font-display"
                >
                  <span>Next</span>
                  <ChevronRight size={15} />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useBlocker, useSearchParams } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, AlertCircle, ListChecks, ChevronLeft, ChevronRight, ClipboardX } from 'lucide-react';
import {
  Skeleton, Breadcrumbs, Button, ChecklistProgressBar, EmptyState, InlineError, PageHeader, PANEL_CLASS,
} from '../../../../components';
import { useConfirm } from '@/components/confirmDialog';
import { ApiError } from '../../../../api/http';
import { userApi } from '../../../../api/users';
import {
  useChecklistDefinitionQuery,
  useCreateChecklistDefinitionMutation,
  useUpdateChecklistDefinitionMutation,
  useChecklistTemplatesQuery,
  useAssignableUsersQuery,
} from '../../hook';
import { ChecklistDetailsFields } from '../form/ChecklistDetailsFields';
import { ImportFromTemplateField } from '../form/ImportFromTemplateField';
import { QuestionTypePalette } from './QuestionTypePalette';
import { itemDraftProblem } from './ItemTypeConfigFields';
import { useStorePeople, splitByVisible, peopleCount } from './useStorePeople';
import { revealAfterRender, questionFieldOf } from './reveal';
import { BuilderSchedulePanel, hasScheduleTimeMismatch } from './BuilderSchedulePanel';
import { BuilderAssignPanel } from './BuilderAssignPanel';
import { BuilderReviewersPanel } from './BuilderReviewersPanel';
import { BuilderStepper } from './wizard/BuilderStepper';
import { BuilderStepFrame } from './wizard/BuilderStepFrame';
import { BuilderReviewStep } from './wizard/BuilderReviewStep';
import { emptyItemDraft, type ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import { normalizeItemOrder, cloneItemDraft, MAX_CHECKLIST_ITEMS } from '../itemSections';
import { BuilderItemsList } from './BuilderItemsList';
import type {
  ChecklistDefinition, ChecklistRecurrence, ChecklistIcon, ChecklistResponseMode,
  ChecklistDefinitionItem, CreateChecklistDefinitionItemPayload,
} from '../../../../api/checklistDefinitions';

const toItemDraft = (item: ChecklistDefinitionItem): ItemDraft => ({
  key: item.id,
  section: item.section,
  label: item.label,
  requiredImageCount: String(item.requiredImageCount),
  maxImageCount: item.maxImageCount != null ? String(item.maxImageCount) : '',
  requiresLivePhoto: item.requiresLivePhoto,
  isCritical: item.isCritical ?? false,
  itemType: item.itemType,
  auditUserIds: item.auditUserIds,
  accessories: item.accessories,
  accessoriesFemale: item.accessoriesFemale,
  accessoriesMale: item.accessoriesMale,
  accessoriesByType: item.accessoriesByType ?? {},
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
  acceptableAnswers: item.acceptableAnswers ?? [],
  acceptableMin: item.acceptableMin != null ? String(item.acceptableMin) : '',
  acceptableMax: item.acceptableMax != null ? String(item.acceptableMax) : '',
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

// The "good answer" rule, only for the types that can be scored. A choice rule drops options the
// question no longer offers, so renaming an option can't leave a rule nothing can match.
const acceptablePayload = (d: ItemDraft) => {
  if (d.itemType === 'YES_NO' || d.itemType === 'PASS_FAIL') {
    return d.acceptableAnswers.length ? { acceptableAnswers: d.acceptableAnswers } : {};
  }
  if (d.itemType === 'MULTIPLE_CHOICE' || d.itemType === 'DROPDOWN') {
    const kept = d.acceptableAnswers.filter(a => d.options.includes(a));
    return kept.length ? { acceptableAnswers: kept } : {};
  }
  if (d.itemType === 'NUMBER_ENTRY' || d.itemType === 'RATING') {
    return {
      ...(d.acceptableMin.trim() ? { acceptableMin: Number(d.acceptableMin) } : {}),
      ...(d.acceptableMax.trim() ? { acceptableMax: Number(d.acceptableMax) } : {}),
    };
  }
  return {};
};

// Only the dress types this question has a real list for are stored: an added type left empty is
// dropped, so it never shadows the gender list with a blank one.
const storedTypeLists = (byType: Record<string, string[]>): Record<string, string[]> =>
  Object.fromEntries(Object.entries(byType).filter(([, list]) => list.length > 0));

// `sections` re-groups the list once more as a safety net: the saved order is this flat order, so
// questions of one section must sit together whatever path last touched the list. `storePersonIds`
// drops auditors the stores no longer include (the server rejects them); null = nothing to compare.
const buildItemPayloads = (
  itemDrafts: ItemDraft[],
  sections: string[],
  storePersonIds: ReadonlySet<string> | null,
): CreateChecklistDefinitionItemPayload[] =>
  normalizeItemOrder(itemDrafts, sections)
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
      isCritical: d.isCritical,
      itemType: d.itemType,
      ...(d.itemType === 'AUDIT' ? {
        auditUserIds: splitByVisible(d.auditUserIds, storePersonIds).shown,
        accessories: d.accessories,
        accessoriesFemale: d.accessoriesFemale,
        accessoriesMale: d.accessoriesMale,
        accessoriesByType: storedTypeLists(d.accessoriesByType),
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
      ...acceptablePayload(d),
      ...(d.itemType === 'SIGNATURE' || d.itemType === 'DUAL_SIGNATURE' ? { signatureLabels: SIGNATURE_LABELS[d.itemType] } : {}),
      ...((d.yesActions.length || d.noActions.length) && (d.itemType === 'YES_NO' || d.itemType === 'PASS_FAIL') ? {
        yesActions: d.yesActions,
        noActions: d.noActions,
      } : {}),
    }));

// The first thing to fix on the Questions step, worded with the question's number, and the key of
// the question to scroll to. null = every question is ready.
const firstItemProblem = (
  itemDrafts: ItemDraft[],
  storePersonIds: ReadonlySet<string> | null,
): { key: string | null; message: string } | null => {
  if (itemDrafts.length === 0) return { key: null, message: 'Add at least one question to continue.' };
  for (let i = 0; i < itemDrafts.length; i++) {
    const d = itemDrafts[i];
    const problem = d.label.trim() ? itemDraftProblem(d, storePersonIds) : 'Type the question staff will see.';
    if (problem) return { key: d.key, message: `Question ${i + 1}: ${problem}` };
  }
  return null;
};

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5, 6];

const STEPS = [
  { key: 'basics', label: 'Basics' },
  { key: 'schedule', label: 'Schedule' },
  { key: 'items', label: 'Questions' },
  { key: 'assign', label: 'Assign' },
  { key: 'reviewers', label: 'Reviewers' },
  { key: 'review', label: 'Review' },
] as const;

// Shown next to the Next button so it's clear *why* it's blocked, not just that it is. The
// Questions step's reason is worked out per question (it names the one to fix).
const STEP_BLOCK_REASON: Record<number, string> = {
  0: 'Give this checklist a name to continue.',
  1: "Pick a store and a start date. Opening and closing can't be the same time.",
  3: 'Add at least one person to continue.',
};

// A snapshot of every field this form can edit, as a plain JSON string rather than a
// field-by-field dirty flag per setter: this form has ~13 independently-editable fields and
// marking each one's setter by hand is exactly the kind of thing that quietly goes stale the next
// time a field is added.
type BuilderSnapshot = {
  name: string; description: string; icon: ChecklistIcon; storeIds: string[]; recurrence: ChecklistRecurrence;
  startDate: string; opensTime: string; cutoffTime: string; activeWeekdays: number[]; responseMode: ChecklistResponseMode;
  assigneeIds: string[]; reviewerIds: string[]; itemDrafts: ItemDraft[]; sections: string[];
};
const snapshotKey = (f: BuilderSnapshot) => JSON.stringify(f);

const BLANK_SNAPSHOT: BuilderSnapshot = {
  name: '', description: '', icon: 'store', storeIds: [], recurrence: 'DAILY', startDate: '',
  opensTime: '', cutoffTime: '', activeWeekdays: DEFAULT_WORKING_WEEKDAYS, responseMode: 'SHARED',
  assigneeIds: [], reviewerIds: [], itemDrafts: [], sections: [],
};

// Mirrors the loaded page: breadcrumb line, header, then the wizard card with its stepper row and a
// step body. min-h (not a fixed height) so it never clips or leaves a hole.
const BuilderSkeleton = () => (
  <div className="flex flex-col gap-6 w-full py-2 sm:py-4" aria-busy="true">
    <Skeleton className="h-4 w-72 max-w-full rounded" />
    <div className="flex items-center gap-3">
      <Skeleton className="size-11 rounded-lg shrink-0" />
      <div className="flex flex-col gap-2 flex-1 min-w-0">
        <Skeleton className="h-6 w-56 max-w-full rounded" />
        <Skeleton className="hidden sm:block h-4 w-80 max-w-full rounded" />
      </div>
    </div>
    <div className={`${PANEL_CLASS} overflow-hidden`}>
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border/60 bg-muted/20">
        {Array.from({ length: STEPS.length }, (_, i) => (
          <Skeleton key={i} className="size-8 rounded-full shrink-0" />
        ))}
      </div>
      <div className="flex flex-col gap-4 p-4 sm:p-8 min-h-80">
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="h-12 w-full max-w-2xl rounded-lg" />
        <Skeleton className="h-24 w-full max-w-2xl rounded-lg" />
      </div>
    </div>
  </div>
);

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
  // DAILY only: Mon-Sat by default (Sunday off), matching the server default for new checklists.
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>(DEFAULT_WORKING_WEEKDAYS);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [responseMode, setResponseMode] = useState<ChecklistResponseMode>('SHARED');
  // Additive on top of the role-based verify rule, see ChecklistReviewersField.
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>([]);
  // Ordered list of section names the admin has created for this checklist (e.g. "Opening",
  // "Closing", "Operational"). Items without a section render in an "Ungrouped" bucket instead.
  const [sections, setSections] = useState<string[]>([]);
  // Which section a newly-added item lands in, set by clicking a section pill in the items list.
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
  // Captured once at hydrate time, not read live off `existing` at submit time: if a background
  // refetch (e.g. another admin's edit invalidating this query) pulls in a newer version while
  // this form is still open, submitting THAT version would defeat the whole conflict check: it'd
  // look like "nothing changed" even though this form's fields are now stale relative to it.
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>(undefined);

  // Unsaved-changes guard: the baseline is the snapshot taken once at hydrate (or at the
  // create-mode defaults) and refreshed after a successful save. It is only compared against the
  // live values when someone actually tries to leave (see isDirtyNow), never on a render, so a
  // keystroke no longer stringifies the whole form.
  const [baseline, setBaseline] = useState(() => snapshotKey(BLANK_SNAPSHOT));

  // Pre-fills every field from a saved checklist: to edit it, or as the starting point of a copy.
  // A copy gets a new name and fresh question ids; everything else is carried over as it is.
  const applyDefinition = (def: ChecklistDefinition, asCopy: boolean) => {
    const nextName = asCopy ? copiedChecklistName(def.name) : def.name;
    // Trimmed on the way in, not just on submit: a whitespace-only stored value would otherwise
    // render as "unchanged" blank text but silently turn into a real change (cleared to undefined)
    // the moment the admin saves anything else on this checklist.
    const nextDescription = def.description?.trim() ?? '';
    // A copy of a one-time checklist would otherwise carry that date, which has already passed, so
    // the admin has to pick a new one.
    const nextStartDate = asCopy && def.recurrence === 'ONE_TIME' ? '' : def.startDate.slice(0, 10);
    const weekdays = def.activeWeekdays ?? ALL_WEEKDAYS;
    const seenSections: string[] = [];
    for (const item of def.items) {
      if (item.section && !seenSections.includes(item.section)) seenSections.push(item.section);
    }
    // Re-normalized on load (not just after a drag) in case the stored order was ever written by
    // a path that doesn't guarantee same-section contiguity (e.g. a bulk import or direct API
    // call): the builder and instance-detail views both assume items sharing a section sit
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
    setStartDate(nextStartDate);
    setOpensTime(def.opensTime ?? '');
    setCutoffTime(def.cutoffTime ?? '');
    setActiveWeekdays(weekdays);
    setAssigneeIds(def.assigneeIds);
    setResponseMode(def.responseMode ?? 'SHARED');
    setReviewerIds(def.reviewerIds);
    setItemDrafts(hydratedItemDrafts);
    setSections(seenSections);
    // Built from the values computed above, NOT the state setters just called: those won't be
    // visible on `name`/`itemDrafts`/etc. until the next render, so snapshotting off the state
    // variables here would capture the PRE-hydrate (blank) values. A copy isn't "unsaved work"
    // either (leaving straight away loses nothing), so it starts clean, same as an edit.
    setBaseline(snapshotKey({
      name: nextName,
      description: nextDescription,
      icon: def.icon,
      storeIds: def.storeIds,
      recurrence: def.recurrence,
      startDate: nextStartDate,
      opensTime: def.opensTime ?? '',
      cutoffTime: def.cutoffTime ?? '',
      activeWeekdays: weekdays,
      responseMode: def.responseMode ?? 'SHARED',
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

  // Brand-new checklist only (a copy brings its own reviewers): PC is the org's default reviewer, so a fresh checklist starts with every
  // PC-role user pre-picked instead of an empty reviewer list nobody remembers to fill in. Still
  // just a starting point: the maker can remove any of them or add a department's HOD from the
  // grouped picker below. Applied the same way `existing` hydrates above (a guarded state update
  // during render, not inside an effect) and folded into `baseline` too, so this doesn't itself
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

  // The latest form values, kept for the leave-page guards below. Written after each commit and
  // only read from event callbacks, so "is this dirty?" costs nothing until someone navigates.
  const liveRef = useRef<{ snapshot: BuilderSnapshot; baseline: string } | null>(null);
  useEffect(() => {
    liveRef.current = {
      snapshot: {
        name, description, icon, storeIds, recurrence, startDate, opensTime, cutoffTime, activeWeekdays,
        responseMode, assigneeIds, reviewerIds, itemDrafts, sections,
      },
      baseline,
    };
  });
  const isDirtyNow = useCallback(() => {
    const live = liveRef.current;
    return !!live && snapshotKey(live.snapshot) !== live.baseline;
  }, []);

  // Escape hatch for "I just saved, don't warn me on the way out": handleSubmit's onSuccess
  // calls this before navigating so the guard below doesn't immediately re-fire on its own
  // redirect to the new/updated checklist's detail page.
  // The baseline update below only lands on the NEXT render, but onSuccess navigates in the same
  // tick, so the blocker still saw the form as dirty and popped "Discard unsaved changes?" right
  // after "Checklist created". A ref is read at navigation time, so it skips the guard immediately.
  const justSavedRef = useRef(false);
  const markClean = () => {
    justSavedRef.current = true;
    setBaseline(snapshotKey({
      name, description, icon, storeIds, recurrence, startDate, opensTime, cutoffTime, activeWeekdays,
      responseMode, assigneeIds, reviewerIds, itemDrafts, sections,
    }));
  };

  // Who is still visible in the pickers. Picked people the selected stores no longer include stay in
  // the form's state, so every count and the save itself compare against these lists.
  const people = useStorePeople(storeIds);
  const { storePersonIds, activePersonIds } = people;

  // Latest-wins counter for the clean-up below: toggling stores quickly must not let an older answer
  // prune people the newer selection still includes.
  const pruneToken = useRef(0);
  const handleStoreIdsChange = (ids: string[]) => {
    const removedAStore = storeIds.some((id) => !ids.includes(id));
    setStoreIds(ids);
    const token = ++pruneToken.current;
    if (!removedAStore || ids.length === 0) return;
    userApi.getAssignable(undefined, undefined, ids).then(({ data }) => {
      if (token !== pruneToken.current) return;
      const valid = new Set(data.map((u) => u.id));
      const live = liveRef.current?.snapshot;
      if (!live) return;
      const dropped = new Set<string>();
      for (const id of live.assigneeIds) if (!valid.has(id)) dropped.add(id);
      for (const d of live.itemDrafts) {
        if (d.itemType === 'AUDIT') for (const id of d.auditUserIds) if (!valid.has(id)) dropped.add(id);
      }
      if (dropped.size === 0) return;
      setAssigneeIds((prev) => prev.filter((id) => valid.has(id)));
      setItemDrafts((drafts) => drafts.map((d) => (
        d.itemType === 'AUDIT' && d.auditUserIds.some((id) => !valid.has(id))
          ? { ...d, auditUserIds: d.auditUserIds.filter((id) => valid.has(id)) }
          : d
      )));
      toast.info(`Removed ${peopleCount(dropped.size)} who ${dropped.size === 1 ? 'is' : 'are'} not in the selected stores`);
    }).catch(() => { /* The notices on the Assign and Questions steps still flag anyone left over. */ });
  };

  const confirm = useConfirm();
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) => isDirtyNow() && !justSavedRef.current && currentLocation.pathname !== nextLocation.pathname,
      [isDirtyNow],
    ),
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    let cancelled = false;
    (async () => {
      const ok = await confirm({
        title: 'Discard unsaved changes?',
        description: 'This checklist has changes that haven\'t been saved yet. Leaving now will lose them.',
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
  // forward within this SPA). A real tab close or hard refresh bypasses the router entirely, so
  // this is the only way to warn for that case. The browser controls the prompt's own wording.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyNow()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirtyNow]);

  // Identified by the draft's stable `key`, not its array position: an index captured in a
  // row's closure can point at the wrong item if the array is reordered (drag, another row's
  // removal) between render and click. Stable (setState only) so memoised rows can keep it.
  const updateDraft = useCallback((key: string, patch: Partial<ItemDraft>) =>
    setItemDrafts(drafts => drafts.map(d => (d.key === key ? { ...d, ...patch } : d))), []);

  // Inserted via normalizeItemOrder rather than a plain append: appending to the end of the flat
  // array would land the new item after whichever section happens to be last in storage order,
  // not inside its own section's block, breaking the "same-section items are contiguous"
  // assumption every other view relies on.
  // Returns whether the question was added, so the add pop-up stays open (and keeps what was typed)
  // when the checklist is already full.
  const addItem = useCallback((patch: Partial<ItemDraft>): boolean => {
    if ((liveRef.current?.snapshot.itemDrafts.length ?? 0) >= MAX_CHECKLIST_ITEMS) {
      toast.error(`A checklist can have at most ${MAX_CHECKLIST_ITEMS} questions.`);
      return false;
    }
    // `section` goes last: the patch from AddQuestionModal is a whole draft carrying section: null,
    // which used to override the picked section and drop every new item into Ungrouped.
    const draft = { ...emptyItemDraft(), ...patch, section: activeSection };
    setItemDrafts(drafts => normalizeItemOrder([...drafts, draft], sections));
    toast.success('Question added');
    // After the add pop-up has closed and handed focus back, bring the new card into view: on a
    // phone the type grid sits below the list, so the card is otherwise off screen.
    window.setTimeout(() => revealAfterRender(() => questionFieldOf(draft.key), false, 'center'), 80);
    return true;
  }, [activeSection, sections]);

  const removeItem = useCallback((key: string) =>
    setItemDrafts(drafts => drafts.filter(d => d.key !== key)), []);

  const handleImportTemplate = (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return;
    // Every existing draft stays, including one whose label is still empty: dropping it would throw
    // away a question the admin had already configured.
    const kept = itemDrafts;
    const have = new Set(kept.map(d => d.label.trim().toLowerCase()).filter(Boolean));
    const fresh = template.items.filter(item => !have.has(item.label.trim().toLowerCase()));
    if (fresh.length < template.items.length) {
      toast.info(fresh.length === 0
        ? 'Every step of this template is already in the checklist.'
        : `Skipped ${template.items.length - fresh.length} steps that are already in the checklist.`);
    }
    const incoming = fresh.map(item => ({
      ...emptyItemDraft(),
      label: item.label,
      requiredImageCount: String(item.requiredImageCount),
      maxImageCount: item.maxImageCount != null ? String(item.maxImageCount) : '',
      requiresLivePhoto: item.requiresLivePhoto,
    }));
    // The server caps a checklist at 200 questions: trim the template to fit and say so.
    const room = Math.max(0, MAX_CHECKLIST_ITEMS - kept.length);
    const taken = incoming.slice(0, room);
    if (taken.length < incoming.length) {
      toast.warning(taken.length === 0
        ? `Nothing imported: a checklist can have at most ${MAX_CHECKLIST_ITEMS} questions.`
        : `Added ${taken.length} of ${incoming.length} questions: a checklist can have at most ${MAX_CHECKLIST_ITEMS}.`);
    }
    setItemDrafts(normalizeItemOrder([...kept, ...taken], sections));

    // A recurring checklist assigns people at the whole-definition level, not per item (unlike a
    // Task/Ticket checklist item's own assigneeId), so a template item's defaultAssigneeId has no
    // matching per-item field to land in here. Used to be silently dropped; now it seeds the
    // definition's assignee list instead, additive only (same convention as the department
    // bulk-select in ChecklistAssigneesField, never replaces an existing selection).
    const templateAssigneeIds = template.items.map(i => i.defaultAssigneeId).filter((id): id is string => !!id);
    if (templateAssigneeIds.length) {
      setAssigneeIds(prev => [...new Set([...prev, ...templateAssigneeIds])]);
    }
  };

  const basicsValid = !!name.trim();
  const scheduleValid = storeIds.length > 0 && !!startDate && !hasScheduleTimeMismatch(opensTime, cutoffTime);
  // Every draft needs a real label, not just the ones with one already: a blank-label draft used
  // to be waved through here (on the theory that it was just an in-progress row), but every item
  // actually reaches itemDrafts via AddQuestionModal, which already requires a label before it
  // lets you add the item, so a blank label here only ever means an already-configured item had
  // its title accidentally cleared later, and buildItemPayloads silently drops it on submit.
  // Recomputed only when the drafts change. (Non-empty list + every label real is the same test as
  // "at least one payload", without building the payloads on every keystroke.)
  // The first thing to fix on the Questions step, worded with the question's number, and the key to
  // scroll to when Next is pressed.
  const itemProblem = firstItemProblem(itemDrafts, storePersonIds);
  const itemsValid = itemProblem === null;
  // Only people the pickers still show count: a hidden one is rejected by the server on save.
  const visibleAssigneeCount = splitByVisible(assigneeIds, storePersonIds).shown.length;
  const assignValid = visibleAssigneeCount > 0;
  const sectionValidity = useMemo(
    () => [basicsValid, scheduleValid, itemsValid, assignValid] as const,
    [basicsValid, scheduleValid, itemsValid, assignValid],
  );
  const canSubmit = sectionValidity.every(Boolean);
  const isStepValid = (index: number) => (index < sectionValidity.length ? sectionValidity[index] : true);
  const blockReasonFor = (index: number) => {
    if (index === 2) return itemProblem?.message ?? '';
    if (index === 3 && assigneeIds.length > 0) return 'Pick at least one person from the selected stores to continue.';
    return STEP_BLOCK_REASON[index] ?? '';
  };

  // Next on a step that isn't ready explains why (below) and takes you to the first thing to fix.
  const handleNext = () => {
    if (isStepValid(step)) { goToStep(step + 1); return; }
    if (step === 0) revealAfterRender(() => document.getElementById('checklist-name'), true);
    else if (step === 2 && itemProblem?.key) {
      const key = itemProblem.key;
      revealAfterRender(() => questionFieldOf(key), true);
    }
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    const reviewersToSave = splitByVisible(reviewerIds, activePersonIds).shown;
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
      responseMode,
      assigneeIds: splitByVisible(assigneeIds, storePersonIds).shown,
      // A reviewer can work anywhere, so only people who are no longer active are left out.
      reviewerIds: reviewersToSave.length ? reviewersToSave : undefined,
      // Role labels are retired: saving clears any old ones so cards stop showing them.
      assigneeRoles: [],
      // Built here, at save time, rather than on every keystroke.
      items: buildItemPayloads(itemDrafts, sections, storePersonIds),
    };

    if (isEditing) {
      // loadedVersion is always set by this point: hydrate runs synchronously as soon as
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

  if ((isEditing && isLoadingExisting) || (isCopying && isLoadingCopy)) return <BuilderSkeleton />;

  // 404 means the checklist was actually deleted: retrying just repeats the same doomed request
  // (see lib/queryHelpers.ts's handleQueryRetry), so this gets its own message and a way back
  // instead of the generic "try refreshing" banner below, whose Retry can never succeed here.
  if ((isEditing && isDeleted) || (isCopying && copySourceDeleted)) {
    return (
      <div className="w-full p-4 sm:p-6">
        <EmptyState
          icon={ClipboardX}
          title="This checklist was deleted"
          description={`${isCopying ? "There's nothing left to copy." : "There's nothing left here to edit."} Its run history is still on the Checklist Compliance page if you need it.`}
          action={{ label: 'Back to Recurring Checklists', icon: ArrowLeft, onClick: () => navigate('/admin/scheduled-checklists') }}
        />
      </div>
    );
  }

  if ((isEditing && (loadError || !existing)) || (isCopying && (copyFailed || !copySource))) {
    return (
      <div className="w-full p-4 sm:p-6">
        <InlineError
          message="We couldn't load this checklist. Try refreshing, or come back in a bit."
          onRetry={() => (isEditing ? refetchExisting() : refetchCopy())}
        />
      </div>
    );
  }

  // Only the active step is built (not all six on every render, which meant a keystroke in the
  // Items step also rebuilt the Schedule, Assign and Review trees).
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <BuilderStepFrame stepIndex={step} title="Basics" description="Give this checklist a name your team will recognize.">
            {/* Fields sit straight on the wizard card, like every other step: a second bordered
                card inside it (with a "Checklist Details" heading under the step's own "Basics")
                was a box in a box. */}
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
          </BuilderStepFrame>
        );
      case 1:
        return (
          <BuilderStepFrame stepIndex={step} title="Schedule" description="Choose which stores run this checklist and how often.">
            <BuilderSchedulePanel
              storeIds={storeIds}
              onStoreIdsChange={handleStoreIdsChange}
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
          </BuilderStepFrame>
        );
      case 2:
        return (
          <BuilderStepFrame stepIndex={step} title="Questions" description="Add the questions your team needs to answer or complete, in order.">
            <div className="flex flex-col gap-6">
              <ImportFromTemplateField templates={templates} onImport={handleImportTemplate} />
              <div className="grid grid-cols-1 xl:grid-cols-[19rem_1fr] gap-5 xl:gap-6 items-start">
                {/* Below xl (phones, tablets, a laptop with the sidebar open): questions first, the type
                    grid after them, so the question column keeps its width. xl and up: a sticky sidebar
                    next to the list, scrolling inside itself when the screen is short. */}
                <div className={`${PANEL_CLASS} order-last xl:order-first p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto`}>
                  <QuestionTypePalette onAdd={addItem} storeIds={storeIds} />
                </div>

                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-display font-semibold text-text">
                      Questions <span className="font-normal text-text-muted tabular-nums">· {itemDrafts.length}</span>
                    </h3>
                    {itemDrafts.length > 1 && (
                      <span className="hidden sm:inline t-meta font-display text-text-muted">Drag to reorder</span>
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
                    validPersonIds={storePersonIds}
                  />
                </div>
              </div>
            </div>
          </BuilderStepFrame>
        );
      case 3:
        return (
          <BuilderStepFrame stepIndex={step} title="Assign" description="Decide who's responsible for this checklist.">
            <BuilderAssignPanel
              storeIds={storeIds}
              assigneeIds={assigneeIds}
              onAssigneeIdsChange={setAssigneeIds}
              responseMode={responseMode}
              onResponseModeChange={setResponseMode}
              people={people}
            />
          </BuilderStepFrame>
        );
      case 4:
        return (
          <BuilderStepFrame stepIndex={step} title="Reviewers" description="Pick who reviews a filled-in run and approves or sends it back, usually the department head or a PC.">
            <BuilderReviewersPanel
              storeIds={storeIds}
              reviewerIds={reviewerIds}
              onReviewerIdsChange={setReviewerIds}
              people={people}
              isNew={!isEditing && !isCopying}
            />
          </BuilderStepFrame>
        );
      default:
        return (
          <BuilderStepFrame stepIndex={step} title={isEditing ? 'Review & Save changes' : 'Review & Create'}
            description={isEditing ? 'Double-check everything below, then save your changes.' : 'Double-check everything below, then create the checklist.'}>
            <BuilderReviewStep
              name={name}
              description={description}
              storeIds={storeIds}
              recurrence={recurrence}
              startDate={startDate}
              opensTime={opensTime}
              cutoffTime={cutoffTime}
              activeWeekdays={activeWeekdays}
              responseMode={responseMode}
              itemDrafts={itemDrafts}
              assigneeIds={assigneeIds}
              reviewerIds={reviewerIds}
              sectionValidity={sectionValidity}
              onEditSection={goToStep}
              canSubmit={canSubmit}
              isSubmitting={mutation.isPending}
              isEditing={isEditing}
              isActive={isEditing ? existing?.isActive : undefined}
              onSubmit={handleSubmit}
              onReloadLatest={mutation.error instanceof ApiError && mutation.error.status === 409 ? () => {
                void confirm({
                  title: 'Load the latest version?',
                  description: 'Another admin saved this checklist first. Loading it replaces what you have here. Note down any changes you still need to make.',
                  confirmLabel: 'Load latest',
                  cancelLabel: 'Keep editing',
                  variant: 'danger',
                }).then((ok) => { if (ok) window.location.reload(); });
              } : undefined}
              submitError={mutation.isError ? (mutation.error instanceof Error ? mutation.error.message : "Couldn't save this checklist. Try again.") : undefined}
            />
          </BuilderStepFrame>
        );
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full py-2 sm:py-4">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Admin', to: '/admin' },
          { label: 'Recurring Checklists', to: '/admin/scheduled-checklists' },
          { label: isEditing && existing ? existing.name : isCopying ? 'Duplicate Checklist' : 'New Checklist' },
          { label: STEPS[step].label },
        ]}
      />

      <PageHeader
        icon={ListChecks}
        title={isEditing ? `Editing: ${existing?.name}` : isCopying ? 'Duplicate Checklist' : 'New Checklist'}
        subtitle={
          isEditing && existing
            ? `Version ${existing.version} · ${existing.isActive ? `Live in ${existing.storeIds.length} store${existing.storeIds.length !== 1 ? 's' : ''}` : 'Paused'}`
            : isCopying && copySource
              ? `Copied from "${copySource.name}" with its stores, people, schedule and every question. Give it a new name, then save.`
              : 'Build a recurring checklist your team runs on a schedule.'
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/scheduled-checklists')}
            className="font-display pointer-coarse:min-w-11"
            aria-label="Back to Recurring Checklists"
          >
            <ArrowLeft size={13} />
            <span className="hidden sm:inline">Back to Recurring Checklists</span>
          </Button>
        }
      />

      {/* Main Wizard Card */}
      <div className={PANEL_CLASS}>
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
          <ChecklistProgressBar done={step + 1} total={STEPS.length} bare thin className="hidden xl:flex" />
        </div>

        {/* Wizard Content Step */}
        <div className="flex flex-col gap-6 sm:gap-8 p-4 sm:p-8">
          {/* Enter-only: waiting for an exit animation (mode="wait") made every step change take
              twice as long, over a heavy mount. */}
          <motion.div
            key={step}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.05 : 0.2, ease: 'easeOut' }}
          >
            {renderStep()}
          </motion.div>

          {/* Footer Navigation Bar */}
          <div className="flex items-center justify-between pt-4 sm:pt-6 border-t border-border/60">
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
                {/* isStepValid, not a raw sectionValidity[step] index: sectionValidity only
                    covers the first 4 (required) steps; a step past that (Reviewers) has nothing
                    to validate and reads as undefined/always-valid rather than blocked. */}
                {!isStepValid(step) && (
                  <p className="t-meta font-display text-warning flex items-start gap-1 text-right">
                    <AlertCircle size={12} className="shrink-0 mt-px" />
                    {blockReasonFor(step)}
                  </p>
                )}
                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleNext}
                  aria-disabled={!isStepValid(step)}
                  className={`font-display pointer-coarse:h-11 ${isStepValid(step) ? '' : 'opacity-60'}`}
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

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useBlocker, useSearchParams } from 'react-router';
import { motion, useReducedMotion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, AlertCircle, ListChecks, ChevronLeft, ChevronRight, ClipboardX } from 'lucide-react';
import {
  Skeleton, Breadcrumbs, Button, ChecklistProgressBar, EmptyState, IconChip, InlineError, PageHeader, PANEL_CLASS,
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
import { draftPayload, draftProblem } from '../../questionTypes/model';
import { useStorePeople, splitByVisible, peopleCount } from './useStorePeople';
import { revealAfterRender, questionFieldOf } from './reveal';
import { definitionState, STATE_LABEL } from '../definitionState';
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

const copiedChecklistName = (name: string) => `${name.slice(0, 191 - ' (copy)'.length).trimEnd()} (copy)`;

const buildItemPayloads = (
  itemDrafts: ItemDraft[],
  sections: string[],
  storePersonIds: ReadonlySet<string> | null,
): CreateChecklistDefinitionItemPayload[] =>
  normalizeItemOrder(itemDrafts, sections)
    .filter(d => d.label.trim())
    .map(d => ({
      id: d.key,
      label: d.label.trim(),
      section: d.section ?? undefined,
      requiredImageCount: Number(d.requiredImageCount) || 0,
      maxImageCount: d.maxImageCount ? Number(d.maxImageCount) : undefined,
      requiresLivePhoto: d.requiresLivePhoto,
      isCritical: d.isCritical,
      itemType: d.itemType,
      ...draftPayload(d, { storePersonIds }),
    }));

const firstItemProblem = (
  itemDrafts: ItemDraft[],
  storePersonIds: ReadonlySet<string> | null,
): { key: string | null; message: string } | null => {
  if (itemDrafts.length === 0) return { key: null, message: 'Add at least one question to continue.' };
  for (let i = 0; i < itemDrafts.length; i++) {
    const d = itemDrafts[i];
    const problem = d.label.trim() ? draftProblem(d, { storePersonIds }) : 'Type the question staff will see.';
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
  { key: 'reviewers', label: 'Reviewers' },
  { key: 'assign', label: 'Assign' },
  { key: 'review', label: 'Review' },
] as const;

const STEP_BLOCK_REASON: Record<number, string> = {
  0: 'Give this checklist a name to continue.',
  1: "Pick a store and a start date. Opening and closing can't be the same time.",
};

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
  const [activeWeekdays, setActiveWeekdays] = useState<number[]>(DEFAULT_WORKING_WEEKDAYS);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [responseMode, setResponseMode] = useState<ChecklistResponseMode>('SHARED');
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [itemDrafts, setItemDrafts] = useState<ItemDraft[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [step, setStep] = useState(() => {
    if (!definitionId) return 0;
    const wanted = STEPS.findIndex((st) => st.key === searchParams.get('step'));
    return wanted >= 0 ? wanted : STEPS.length - 1;
  });
  const [maxStepReached, setMaxStepReached] = useState(step);
  const [direction, setDirection] = useState<1 | -1>(1);

  const goToStep = (index: number) => {
    setDirection(index > step ? 1 : -1);
    setStep(index);
    setMaxStepReached(m => Math.max(m, index));
  };

  const [hydratedId, setHydratedId] = useState<string | undefined>(undefined);
  const [copiedFromId, setCopiedFromId] = useState<string | undefined>(undefined);
  const [loadedVersion, setLoadedVersion] = useState<number | undefined>(undefined);

  const [baseline, setBaseline] = useState(() => snapshotKey(BLANK_SNAPSHOT));

  const applyDefinition = (def: ChecklistDefinition, asCopy: boolean) => {
    const nextName = asCopy ? copiedChecklistName(def.name) : def.name;
    const nextDescription = def.description?.trim() ?? '';
    const nextStartDate = asCopy && def.recurrence === 'ONE_TIME' ? '' : def.startDate.slice(0, 10);
    const weekdays = def.activeWeekdays ?? ALL_WEEKDAYS;
    const seenSections: string[] = [];
    for (const item of def.items) {
      if (item.section && !seenSections.includes(item.section)) seenSections.push(item.section);
    }
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

  const justSavedRef = useRef(false);
  const markClean = () => {
    justSavedRef.current = true;
    setBaseline(snapshotKey({
      name, description, icon, storeIds, recurrence, startDate, opensTime, cutoffTime, activeWeekdays,
      responseMode, assigneeIds, reviewerIds, itemDrafts, sections,
    }));
  };

  const people = useStorePeople(storeIds);
  const { storePersonIds, activePersonIds } = people;
  const refetchPeople = people.refetch;
  useEffect(() => {
    if (step === 3 || step === 4) refetchPeople();
  }, [step, refetchPeople]);
  useEffect(() => {
    justSavedRef.current = false;
  }, [definitionId, copyFromId]);

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
      const left = live.assigneeIds.filter((id) => valid.has(id)).length;
      toast.info(`Removed ${peopleCount(dropped.size)} who ${dropped.size === 1 ? 'is' : 'are'} not in the selected stores`, left === 0 && live.assigneeIds.length > 0 ? { description: 'Nobody is left to fill it in, so saving makes it a draft.' } : undefined);
    }).catch(() => { });
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

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!isDirtyNow()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirtyNow]);

  const updateDraft = useCallback((key: string, patch: Partial<ItemDraft>) =>
    setItemDrafts(drafts => drafts.map(d => (d.key === key ? { ...d, ...patch } : d))), [setItemDrafts]);

  const addItem = useCallback((patch: Partial<ItemDraft>): boolean => {
    if ((liveRef.current?.snapshot.itemDrafts.length ?? 0) >= MAX_CHECKLIST_ITEMS) {
      toast.error(`A checklist can have at most ${MAX_CHECKLIST_ITEMS} questions.`);
      return false;
    }
    const draft = { ...emptyItemDraft(), ...patch, section: activeSection };
    setItemDrafts(drafts => normalizeItemOrder([...drafts, draft], sections));
    toast.success('Question added');
    window.setTimeout(() => revealAfterRender(() => questionFieldOf(draft.key), false, 'center'), 80);
    return true;
  }, [activeSection, sections, setItemDrafts]);

  const removeItem = useCallback((key: string) =>
    setItemDrafts(drafts => drafts.filter(d => d.key !== key)), [setItemDrafts]);

  const handleImportTemplate = (templateId: string) => {
    const template = templates?.find(t => t.id === templateId);
    if (!template) return;
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
    const room = Math.max(0, MAX_CHECKLIST_ITEMS - kept.length);
    const taken = incoming.slice(0, room);
    if (taken.length < incoming.length) {
      toast.warning(taken.length === 0
        ? `Nothing imported: a checklist can have at most ${MAX_CHECKLIST_ITEMS} questions.`
        : `Added ${taken.length} of ${incoming.length} questions: a checklist can have at most ${MAX_CHECKLIST_ITEMS}.`);
    }
    setItemDrafts(normalizeItemOrder([...kept, ...taken], sections));

    const templateAssigneeIds = template.items.map(i => i.defaultAssigneeId).filter((id): id is string => !!id);
    if (templateAssigneeIds.length && storePersonIds) {
      setAssigneeIds(prev => [...new Set([...prev, ...splitByVisible(templateAssigneeIds, storePersonIds).shown])]);
    }
  };

  const basicsValid = !!name.trim();
  const scheduleValid = storeIds.length > 0 && !!startDate && !hasScheduleTimeMismatch(opensTime, cutoffTime);
  const itemProblem = firstItemProblem(itemDrafts, storePersonIds);
  const itemsValid = itemProblem === null;
  const visibleAssigneeCount = splitByVisible(assigneeIds, storePersonIds).shown.length;
  const hasPeople = visibleAssigneeCount > 0;
  const sectionValidity = useMemo(
    () => [basicsValid, scheduleValid, itemsValid, true, true] as const,
    [basicsValid, scheduleValid, itemsValid],
  );
  const canSubmit = sectionValidity.every(Boolean) && (people.isReady || !isEditing);
  const isStepValid = (index: number) => (index < sectionValidity.length ? sectionValidity[index] : true);
  const blockReasonFor = (index: number) => {
    if (index === 2) return itemProblem?.message ?? '';
    return STEP_BLOCK_REASON[index] ?? '';
  };

  const handleNext = () => {
    if (isStepValid(step)) { goToStep(step + 1); return; }
    if (step === 0) revealAfterRender(() => document.getElementById('checklist-name'), true);
    else if (step === 2 && itemProblem?.key) {
      const key = itemProblem.key;
      revealAfterRender(() => questionFieldOf(key), true);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (isEditing && existing?.isActive && !hasPeople) {
      const ok = await confirm({
        title: 'Save as a draft?',
        description: "Nobody is assigned, so this checklist goes off everyone's list. Today's runs nobody started are removed. Runs already started stay.",
        confirmLabel: 'Save as draft',
        cancelLabel: 'Keep editing',
      });
      if (!ok) return;
    }
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
      reviewerIds: reviewersToSave.length ? reviewersToSave : undefined,
      assigneeRoles: [],
      items: buildItemPayloads(itemDrafts, sections, storePersonIds),
    };

    if (isEditing) {
      if (loadedVersion == null) return;
      updateDefinition.mutate({ id: definitionId!, payload: { ...payload, version: loadedVersion } }, {
        onSuccess: ({ definition }) => { markClean(); navigate(`/admin/scheduled-checklists/${definition.id}`); },
      });
    } else {
      createDefinition.mutate(payload, {
        onSuccess: (created) => {
          markClean();
          navigate(`/admin/scheduled-checklists/${created.id}`);
        },
      });
    }
  };

  if ((isEditing && isLoadingExisting) || (isCopying && isLoadingCopy)) return <BuilderSkeleton />;

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

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <BuilderStepFrame stepIndex={step} title="Basics" description="Give this checklist a name your team will recognize.">
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
                <div className={`${PANEL_CLASS} order-last xl:order-first p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)] xl:overflow-y-auto`}>
                  <QuestionTypePalette onAdd={addItem} storeIds={storeIds} />
                </div>

                <div className="flex flex-col gap-3 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="t-card font-display font-semibold text-text">
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
      case 4:
        return (
          <BuilderStepFrame stepIndex={step} title="Assign" description="Pick who fills it in. Their account not ready yet? Leave it empty and save as a draft. Add them later and it goes live.">
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
              hasPeople={hasPeople}
              hideSubmit
              isSubmitting={mutation.isPending}
              isEditing={isEditing}
              isActive={isEditing ? existing?.isActive : undefined}
              onSubmit={() => void handleSubmit()}
              onReloadLatest={mutation.error instanceof ApiError && mutation.error.status === 409 ? () => {
                void confirm({
                  title: 'Load the latest version?',
                  description: 'Another admin saved this checklist first. Loading it replaces what you have here. Note down any changes you still need to make.',
                  confirmLabel: 'Load latest',
                  cancelLabel: 'Keep editing',
                  variant: 'danger',
                }).then(async (ok) => {
                  if (!ok) return;
                  const fresh = await refetchExisting();
                  if (!fresh.data) return;
                  mutation.reset();
                  setLoadedVersion(fresh.data.version);
                  applyDefinition(fresh.data, false);
                  toast.success('Loaded the latest version');
                });
              } : undefined}
              submitError={mutation.isError ? (mutation.error instanceof Error ? mutation.error.message : "Couldn't save this checklist. Try again.") : undefined}
            />
          </BuilderStepFrame>
        );
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:gap-6 w-full py-1 sm:py-4">
      <div className="hidden sm:block">
      <Breadcrumbs
        items={[
          { label: 'Dashboard', to: '/' },
          { label: 'Admin', to: '/admin' },
          { label: 'Recurring Checklists', to: '/admin/scheduled-checklists' },
          { label: isEditing && existing ? existing.name : isCopying ? 'Duplicate Checklist' : 'New Checklist' },
          { label: STEPS[step].label },
        ]}
      />
      </div>

      <div className="hidden sm:block">
      <PageHeader
        icon={ListChecks}
        title={isEditing ? `Editing: ${existing?.name}` : isCopying ? 'Duplicate Checklist' : 'New Checklist'}
        subtitle={
          isEditing && existing
            ? `Version ${existing.version} · ${existing.isActive ? `Live in ${existing.storeIds.length} store${existing.storeIds.length !== 1 ? 's' : ''}` : STATE_LABEL[definitionState(existing)]}`
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
      </div>

      <div className={PANEL_CLASS}>
        <div className="flex flex-col gap-3 px-4 sm:px-6 pt-2 sm:pt-5 pb-2 sm:pb-4 border-b border-border/60 bg-muted/20 rounded-t-2xl">
          <div className="flex items-center gap-2 sm:hidden min-w-0">
            <span className="line-clamp-1 t-card font-display font-bold text-text">{name.trim() || (isEditing ? existing?.name : 'New checklist')}</span>
            {isEditing && existing && (
              <IconChip icon={false} label={STATE_LABEL[definitionState(existing)]} labelClassName={existing.isActive ? 'text-success' : 'text-warning'} className="shrink-0" />
            )}
          </div>
          <BuilderStepper
            steps={STEPS}
            current={step}
            maxReached={maxStepReached}
            allUnlocked={isEditing || isCopying}
            isStepValid={isStepValid}
            onSelect={goToStep}
            onExit={() => navigate('/admin/scheduled-checklists')}
          />
          <ChecklistProgressBar done={step + 1} total={STEPS.length} bare thin className="hidden xl:flex" />
        </div>

        <div className="flex flex-col gap-6 sm:gap-8 px-4 pt-4 pb-0 sm:px-8 sm:pt-8">
          <motion.div
            key={step}
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: shouldReduceMotion ? 0.05 : 0.2, ease: 'easeOut' }}
          >
            {renderStep()}
          </motion.div>

          <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] md:bottom-0 z-20 -mx-4 sm:-mx-8 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-8 py-3 border-t border-border/60 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85 rounded-b-2xl">
            {step === STEPS.length - 1 && mutation.isError && (
              <p role="alert" className="order-first flex w-full items-start gap-1.5 t-meta font-display font-medium text-danger">
                <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden />
                <span className="min-w-0 break-words">{mutation.error instanceof Error ? mutation.error.message : "Couldn't save this checklist. Try again."}</span>
              </p>
            )}
            {step > 0 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => goToStep(step - 1)}
                className="font-display pointer-coarse:h-11"
              >
                <ChevronLeft size={15} />
                <span>Back</span>
              </Button>
            ) : <span />}

            {step < STEPS.length - 1 && (
              <div className="flex flex-col items-end gap-1.5">
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
            {step === STEPS.length - 1 && (
              <Button
                type="button"
                variant="primary"
                size="md"
                onClick={() => void handleSubmit()}
                isLoading={mutation.isPending}
                disabled={!canSubmit}
                className="font-display pointer-coarse:h-11"
              >
                {mutation.isPending ? 'Saving…' : !hasPeople ? 'Save as draft' : isEditing ? 'Save changes' : 'Create checklist'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

import { Type, CalendarClock, ListChecks, ShieldCheck, Users, ClipboardCheck } from 'lucide-react';
import { draftPayload, draftProblem } from '../../questionTypes/model';
import type { ItemDraft } from '../ChecklistDefinitionItemDraftRow';
import { normalizeItemOrder } from '../itemSections';
import type {
  ChecklistRecurrence, ChecklistIcon, ChecklistResponseMode,
  ChecklistDefinitionItem, CreateChecklistDefinitionItemPayload,
} from '../../../../api/checklistDefinitions';

export const toItemDraft = (item: ChecklistDefinitionItem): ItemDraft => ({
  key: item.id,
  section: item.section,
  label: item.label,
  requiredImageCount: String(item.requiredImageCount),
  maxImageCount: item.maxImageCount != null ? String(item.maxImageCount) : '',
  requiresLivePhoto: item.requiresLivePhoto,
  referenceImageUrl: item.referenceImageUrl ?? '',
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

export const copiedChecklistName = (name: string) => `${name.slice(0, 191 - ' (copy)'.length).trimEnd()} (copy)`;

export const buildItemPayloads = (
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
      referenceImageUrl: d.referenceImageUrl || null,
      isCritical: d.isCritical,
      itemType: d.itemType,
      ...draftPayload(d, { storePersonIds }),
    }));

export const firstItemProblem = (
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

export const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const DEFAULT_WORKING_WEEKDAYS = [1, 2, 3, 4, 5, 6];

export const STEPS = [
  { key: 'basics', label: 'Basics', icon: Type },
  { key: 'schedule', label: 'Schedule', icon: CalendarClock },
  { key: 'items', label: 'Questions', icon: ListChecks },
  { key: 'reviewers', label: 'Reviewers', icon: ShieldCheck },
  { key: 'assign', label: 'Assign', icon: Users },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
] as const;

export const STEP_BLOCK_REASON: Record<number, string> = {
  0: 'Give this checklist a name to continue.',
};

export type BuilderSnapshot = {
  name: string; description: string; icon: ChecklistIcon; storeIds: string[]; recurrence: ChecklistRecurrence;
  startDate: string; opensTime: string; cutoffTime: string; lateUntilTime: string; activeWeekdays: number[]; responseMode: ChecklistResponseMode;
  assigneeIds: string[]; reviewerIds: string[]; itemDrafts: ItemDraft[]; sections: string[];
};
export const snapshotKey = (f: BuilderSnapshot) => JSON.stringify(f);

export const BLANK_SNAPSHOT: BuilderSnapshot = {
  name: '', description: '', icon: 'store', storeIds: [], recurrence: 'DAILY', startDate: '',
  opensTime: '', cutoffTime: '', lateUntilTime: '', activeWeekdays: DEFAULT_WORKING_WEEKDAYS, responseMode: 'SHARED',
  assigneeIds: [], reviewerIds: [], itemDrafts: [], sections: [],
};

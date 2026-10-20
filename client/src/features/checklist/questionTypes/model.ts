import type { ChecklistItemType } from '../../../api/checklistDefinitions';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';
import type { ItemDraft } from '../definition/ChecklistDefinitionItemDraftRow';
import { splitByVisible } from '../definition/builder/useStorePeople';
import { formatDateTime } from '../checklistDisplay';

export type AnswerVerdict = 'good' | 'bad';

export type ScoringKind = 'boolean' | 'choice' | 'range';

export interface BuilderContext {
  storePersonIds: ReadonlySet<string> | null;
}

export interface QuestionTypeModel {
  scoring: ScoringKind | null;
  booleanRules: boolean;
  photo: { minRequired: number; noun: 'photo' | 'video' } | null;
  answerText: (item: ChecklistInstanceItem) => string | null;
  problem?: (draft: ItemDraft, ctx: BuilderContext) => string | null;
  payload?: (draft: ItemDraft, ctx: BuilderContext) => Record<string, unknown>;
}

const num = (v: string) => (v.trim() === '' ? null : Number(v));
const numOrUndefined = (v: string) => (v.trim() ? Number(v) : undefined);

const SIGNATURE_LABELS: Record<string, string[]> = {
  SIGNATURE: ['Signature'],
  DUAL_SIGNATURE: ['Employee', 'Supervisor'],
};

const storedTypeLists = (byType: Record<string, string[]>): Record<string, string[]> =>
  Object.fromEntries(Object.entries(byType).filter(([, list]) => list.length > 0));

const acceptableRange = (d: ItemDraft) => ({
  ...(d.acceptableMin.trim() ? { acceptableMin: Number(d.acceptableMin) } : {}),
  ...(d.acceptableMax.trim() ? { acceptableMax: Number(d.acceptableMax) } : {}),
});

const acceptableList = (d: ItemDraft, allowed?: readonly string[]) => {
  const kept = allowed ? d.acceptableAnswers.filter((a) => allowed.includes(a)) : d.acceptableAnswers;
  return kept.length ? { acceptableAnswers: kept } : {};
};

const numberLimitsProblem = (d: ItemDraft): string | null => {
  const min = num(d.numberEntryMin);
  const max = num(d.numberEntryMax);
  return min != null && max != null && min > max ? "The lowest allowed can't be more than the highest." : null;
};

const numberLimitsPayload = (d: ItemDraft) => ({
  numberEntryUnit: d.numberEntryUnit.trim() || undefined,
  numberEntryMin: numOrUndefined(d.numberEntryMin),
  numberEntryMax: numOrUndefined(d.numberEntryMax),
});

const photoProblem = (noun: 'photo' | 'video', minRequired: number) => (d: ItemDraft): string | null => {
  const min = num(d.requiredImageCount) ?? 0;
  const max = num(d.maxImageCount);
  if (!Number.isInteger(min) || min < 0) return `The minimum ${noun} count must be a whole number, 0 or more.`;
  if (max != null && (!Number.isInteger(max) || max < 0)) return `The maximum ${noun} count must be a whole number, 0 or more.`;
  if (minRequired > 0 && min < minRequired) return `A ${noun} question needs at least ${minRequired} ${noun}.`;
  if (max != null && min > max) return "Minimum can't be more than the maximum, or staff could never finish it.";
  return null;
};

const choiceModel = (): QuestionTypeModel => ({
  scoring: 'choice',
  booleanRules: false,
  photo: null,
  answerText: (item) => (item.textValue ? `Answered: ${item.textValue}` : null),
  problem: (d) => (d.options.length < 2 ? 'Add at least two options.' : null),
  payload: (d) => ({ options: d.options, ...acceptableList(d, d.options) }),
});

const booleanModel = (yes: string, no: string): QuestionTypeModel => ({
  scoring: 'boolean',
  booleanRules: true,
  photo: null,
  answerText: (item) => (item.booleanAnswer === 'YES' ? yes : item.booleanAnswer === 'NO' ? no : null),
  payload: (d) => ({
    ...acceptableList(d),
    ...(d.yesActions.length || d.noActions.length ? { yesActions: d.yesActions, noActions: d.noActions } : {}),
  }),
});

const signatureModel = (key: 'SIGNATURE' | 'DUAL_SIGNATURE'): QuestionTypeModel => ({
  scoring: null,
  booleanRules: false,
  photo: null,
  answerText: (item) => (item.signatureValue ? 'Signed' : null),
  payload: () => ({ signatureLabels: SIGNATURE_LABELS[key] }),
});

const plainModel = (text: (item: ChecklistInstanceItem) => string | null): QuestionTypeModel => ({
  scoring: null,
  booleanRules: false,
  photo: null,
  answerText: text,
});

const gpsProblem = (d: ItemDraft): string | null => {
  const lat = num(d.gpsTargetLat);
  const lng = num(d.gpsTargetLng);
  const radius = num(d.gpsRadiusMeters);
  if ((lat == null) !== (lng == null)) return 'Enter both latitude and longitude, or remove the spot.';
  if (lat != null && (lat < -90 || lat > 90)) return 'Latitude must be between -90 and 90.';
  if (lng != null && (lng < -180 || lng > 180)) return 'Longitude must be between -180 and 180.';
  if (radius != null && radius < 1) return 'The distance must be at least 1 metre.';
  if (radius != null && lat == null) return 'Enter the spot’s latitude and longitude, or remove the spot.';
  if (lat != null && radius == null) return 'Set how close they must be, or the location is never checked.';
  return null;
};

const numberProblem = (d: ItemDraft): string | null => {
  const limits = numberLimitsProblem(d);
  if (limits) return limits;
  const min = num(d.acceptableMin);
  const max = num(d.acceptableMax);
  if (min != null && max != null && min > max) return "The lowest good answer can't be more than the highest.";
  const lo = num(d.numberEntryMin);
  const hi = num(d.numberEntryMax);
  if (lo != null && hi != null && ((min != null && (min < lo || min > hi)) || (max != null && (max < lo || max > hi)))) {
    return `Good answers must be between ${lo} and ${hi}, the range staff can enter.`;
  }
  return null;
};

const ratingProblem = (d: ItemDraft): string | null => {
  const min = num(d.acceptableMin);
  const max = num(d.acceptableMax);
  if (min != null && max != null && min > max) return "The lowest good answer can't be more than the highest.";
  const scale = num(d.ratingScale);
  if (scale != null && (!Number.isInteger(scale) || scale < 2 || scale > 10)) return 'The rating scale must be a whole number from 2 to 10.';
  if (scale != null && ((min != null && (min < 1 || min > scale)) || (max != null && (max < 1 || max > scale)))) {
    return `Good answers must be between 1 and ${scale} stars.`;
  }
  return null;
};

export const QUESTION_MODELS: Record<ChecklistItemType, QuestionTypeModel> = {
  STANDARD: { scoring: null, booleanRules: false, photo: { minRequired: 0, noun: 'photo' }, answerText: () => null, problem: photoProblem('photo', 0) },
  VIDEO_UPLOAD: { scoring: null, booleanRules: false, photo: { minRequired: 1, noun: 'video' }, answerText: () => null, problem: photoProblem('video', 1) },
  YES_NO: booleanModel('Answered Yes', 'Answered No'),
  PASS_FAIL: booleanModel('Pass', 'Fail'),
  MULTIPLE_CHOICE: choiceModel(),
  DROPDOWN: choiceModel(),
  TEXT_BOX: plainModel((item) => (item.textValue ? `Answered: ${item.textValue}` : null)),
  NUMBER_ENTRY: {
    scoring: 'range',
    booleanRules: false,
    photo: null,
    answerText: (item) => (item.numericValue != null ? `Entered ${item.numericValue}${item.numberEntryUnit ? ` ${item.numberEntryUnit}` : ''}` : null),
    problem: numberProblem,
    payload: (d) => ({ ...numberLimitsPayload(d), ...acceptableRange(d) }),
  },
  RATING: {
    scoring: 'range',
    booleanRules: false,
    photo: null,
    answerText: (item) => (item.numericValue != null ? `Rated ${item.numericValue} of ${item.ratingScale ?? 5}` : null),
    problem: ratingProblem,
    payload: (d) => ({ ratingScale: numOrUndefined(d.ratingScale), ...acceptableRange(d) }),
  },
  CASH_TALLY: {
    scoring: null,
    booleanRules: false,
    photo: null,
    answerText: (item) => (item.numericValue != null ? `Entered ${item.numericValue}${item.numberEntryUnit ? ` ${item.numberEntryUnit}` : ''}` : null),
    problem: (d) => numberLimitsProblem(d) ?? ((num(d.cashExpectedAmount) ?? 0) < 0 ? "Expected amount can't be negative." : null),
    payload: (d) => ({ ...numberLimitsPayload(d), cashExpectedAmount: numOrUndefined(d.cashExpectedAmount) }),
  },
  DATE_TIME: plainModel((item) => (item.dateValue ? `Picked ${formatDateTime(item.dateValue)}` : null)),
  GPS: {
    scoring: null,
    booleanRules: false,
    photo: null,
    answerText: (item) => (item.gpsLat != null ? 'Location recorded' : null),
    problem: gpsProblem,
    payload: (d) => ({
      gpsTargetLat: numOrUndefined(d.gpsTargetLat),
      gpsTargetLng: numOrUndefined(d.gpsTargetLng),
      gpsRadiusMeters: numOrUndefined(d.gpsRadiusMeters),
    }),
  },
  SIGNATURE: signatureModel('SIGNATURE'),
  DUAL_SIGNATURE: signatureModel('DUAL_SIGNATURE'),
  QR_SCAN: {
    scoring: null,
    booleanRules: false,
    photo: null,
    answerText: (item) => (item.textValue ? 'Code scanned' : null),
    payload: (d) => ({ qrExpectedValue: d.qrExpectedValue.trim() || undefined }),
  },
  AUDIT: {
    scoring: null,
    booleanRules: false,
    photo: null,
    answerText: (item) => {
      const checked = item.submissions.filter((s) => s.isDone).length;
      return `${checked} of ${item.submissions.length} people checked`;
    },
    problem: (d, ctx) => {
      if (splitByVisible(d.auditUserIds, ctx.storePersonIds).shown.length > 0) return null;
      return d.auditUserIds.length > 0 ? 'Pick at least one person from the selected stores to audit.' : 'Pick at least one person to audit.';
    },
    payload: (d, ctx) => ({
      auditUserIds: splitByVisible(d.auditUserIds, ctx.storePersonIds).shown,
      accessories: d.accessories,
      accessoriesFemale: d.accessoriesFemale,
      accessoriesMale: d.accessoriesMale,
      accessoriesByType: storedTypeLists(d.accessoriesByType),
    }),
  },
};

export const modelOf = (type: ChecklistItemType): QuestionTypeModel => QUESTION_MODELS[type];

export const answerTextFor = (item: ChecklistInstanceItem): string | null => modelOf(item.itemType).answerText(item);

export const isScorableType = (type: ChecklistItemType): boolean => modelOf(type).scoring !== null;

export const hasBooleanRules = (type: ChecklistItemType): boolean => modelOf(type).booleanRules;

export const draftProblem = (draft: ItemDraft, ctx: BuilderContext): string | null => {
  if (draft.label.trim().length > 191) return 'Keep the question under 191 characters.';
  return modelOf(draft.itemType).problem?.(draft, ctx) ?? null;
};

export const draftPayload = (draft: ItemDraft, ctx: BuilderContext): Record<string, unknown> =>
  modelOf(draft.itemType).payload?.(draft, ctx) ?? {};

export const patchForTypeSwitch = (draft: ItemDraft, itemType: ChecklistItemType): Partial<ItemDraft> => {
  const next = modelOf(itemType);
  const patch: Partial<ItemDraft> = { itemType };
  if (!next.photo) {
    patch.requiredImageCount = '0';
    patch.maxImageCount = '';
    patch.requiresLivePhoto = false;
  } else if ((num(draft.requiredImageCount) ?? 0) < next.photo.minRequired) {
    patch.requiredImageCount = String(next.photo.minRequired);
  }
  if (itemType !== draft.itemType) {
    patch.acceptableAnswers = [];
    patch.acceptableMin = '';
    patch.acceptableMax = '';
  }
  if (!next.booleanRules) {
    patch.yesActions = [];
    patch.noActions = [];
  }
  return patch;
};

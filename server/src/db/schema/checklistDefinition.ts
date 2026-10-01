import {
  mysqlTable,
  varchar,
  text,
  int,
  float,
  boolean,
  datetime,
  json,
  mysqlEnum,
  index,
  uniqueIndex,
  foreignKey,
} from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';
import { users, stores } from './core.js';


export const CHECKLIST_RECURRENCES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ONE_TIME'] as const;
export type ChecklistRecurrence = (typeof CHECKLIST_RECURRENCES)[number];
export const CHECKLIST_ASSIGNEE_ROLES = [
  'STORE_MANAGER',
  'FLOOR_MANAGER',
  'CASHIER',
  'SECURITY',
  'HOUSEKEEPING',
  'OPERATIONS',
] as const;
export const CHECKLIST_ICONS = [
  'store',
  'clock',
  'star',
  'check',
  'shield',
  'alert-triangle',
  'hash',
  'shield-check',
  'calendar',
] as const;

export const CHECKLIST_ITEM_TYPES = [
  'STANDARD',
  'AUDIT',
  'NUMBER_ENTRY',
  'RATING',
  'YES_NO',
  'PASS_FAIL',
  'MULTIPLE_CHOICE',
  'DROPDOWN',
  'TEXT_BOX',
  'DATE_TIME',
  'GPS',
  'SIGNATURE',
  'DUAL_SIGNATURE',
  'QR_SCAN',
  'CASH_TALLY',
  'VIDEO_UPLOAD',
] as const;

export const CHECKLIST_CONDITIONAL_ACTIONS = [
  'REQUIRE_PHOTO',
  'ASK_REASON',
  'CREATE_ISSUE',
  'NOTIFY_AREA_MANAGER',
] as const;

export const YES_NO_VALUES = ['YES', 'NO'] as const;


export const checklistDefinitions = mysqlTable(
  'ChecklistDefinition',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    description: text('description'),
    recurrence: mysqlEnum('recurrence', CHECKLIST_RECURRENCES).notNull(),
    startDate: datetime('startDate', { mode: 'date' }).notNull(),
    opensTime: varchar('opensTime', { length: 5 }), // HH:mm, validated at app layer
    cutoffTime: varchar('cutoffTime', { length: 5 }), // HH:mm, validated at app layer
    isActive: boolean('isActive').notNull().default(true),
    assigneeRoles: json('assigneeRoles').$type<(typeof CHECKLIST_ASSIGNEE_ROLES)[number][]>(),
    icon: mysqlEnum('icon', CHECKLIST_ICONS).notNull().default('store'),
    // DAILY only: which weekdays a run is created on (0 = Sunday … 6 = Saturday, same as
    // Date#getDay). Null means every day. New daily checklists default to Mon–Sat.
    activeWeekdays: json('activeWeekdays').$type<number[]>(),
    version: int('version').notNull().default(1),
    createdBy: varchar('createdBy', { length: 191 }).notNull().references(() => users.id),
    // Soft-delete: remove() sets this instead of deleting the row — which used to cascade through
    // every ChecklistDefinitionItem/Store/Assignee/Reviewer AND every ChecklistInstance ever
    // generated from it (plus that instance tree's own items/images/submissions). None of that is
    // touched now: the whole history stays recoverable. Independent of `isActive` above (a
    // separate pause/resume switch) — every read path in checklistDefinition.service.ts, and the
    // instance-generation sweep, must AND in `isNull(checklistDefinitions.deletedAt)`.
    deletedAt: datetime('deletedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistDefinition_deletedAt_idx').on(table.deletedAt)],
);

export const checklistDefinitionStores = mysqlTable(
  'ChecklistDefinitionStore',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    definitionId: varchar('definitionId', { length: 191 })
      .notNull()
      .references(() => checklistDefinitions.id, { onDelete: 'cascade' }),
    storeId: varchar('storeId', { length: 191 }).notNull().references(() => stores.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('ChecklistDefinitionStore_definitionId_storeId_key').on(table.definitionId, table.storeId)],
);

export const checklistDefinitionAssignees = mysqlTable(
  'ChecklistDefinitionAssignee',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    definitionId: varchar('definitionId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ChecklistDefinitionAssignee_definitionId_userId_key').on(table.definitionId, table.userId),
    foreignKey({
      columns: [table.definitionId],
      foreignColumns: [checklistDefinitions.id],
      name: 'ChklistDefAssignee_definitionId_fk',
    }).onDelete('cascade'),
  ],
);

// Explicit reviewers, additive on top of the role-based verify rule (ADMIN/PC always, MANAGER/HOD
// scoped to their own department — see checklistInstance.service.ts's CAN_VERIFY_BY_ROLE): naming
// someone here lets them approve/reject this checklist's instances regardless of role or
// department, without replacing who could already verify it.
export const checklistDefinitionReviewers = mysqlTable(
  'ChecklistDefinitionReviewer',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    definitionId: varchar('definitionId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ChecklistDefinitionReviewer_definitionId_userId_key').on(table.definitionId, table.userId),
    foreignKey({
      columns: [table.definitionId],
      foreignColumns: [checklistDefinitions.id],
      name: 'ChklistDefReviewer_definitionId_fk',
    }).onDelete('cascade'),
  ],
);

export const checklistDefinitionItems = mysqlTable(
  'ChecklistDefinitionItem',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    label: varchar('label', { length: 191 }).notNull(),
    order: int('order').notNull().default(0),
    // Free-text grouping label (e.g. "Opening", "Closing", "Operational") — purely organizational,
    // items with no section (null) render in an "Ungrouped" bucket. Copied onto the generated
    // ChecklistInstanceItem at generation time, same as every other definition-authored field.
    section: varchar('section', { length: 120 }),
    requiredImageCount: int('requiredImageCount').notNull().default(0),
    maxImageCount: int('maxImageCount'),
    requiresLivePhoto: boolean('requiresLivePhoto').notNull().default(false),
    itemType: mysqlEnum('itemType', CHECKLIST_ITEM_TYPES).notNull().default('STANDARD'),
    accessories: json('accessories').$type<string[]>(),
    // AUDIT only: what to check on a FEMALE / MALE person. An audited person gets the list that
    // matches their gender (User.gender); when that list is empty, or their gender isn't set, they
    // get the main `accessories` list above.
    accessoriesFemale: json('accessoriesFemale').$type<string[]>(),
    accessoriesMale: json('accessoriesMale').$type<string[]>(),
    numberEntryUnit: varchar('numberEntryUnit', { length: 191 }),
    numberEntryMin: float('numberEntryMin'),
    numberEntryMax: float('numberEntryMax'),
    ratingScale: int('ratingScale'),
    options: json('options').$type<string[]>(),
    gpsTargetLat: float('gpsTargetLat'),
    gpsTargetLng: float('gpsTargetLng'),
    gpsRadiusMeters: float('gpsRadiusMeters'),
    signatureLabels: json('signatureLabels').$type<string[]>(),
    qrExpectedValue: varchar('qrExpectedValue', { length: 191 }),
    cashExpectedAmount: float('cashExpectedAmount'),
    // Two independent action sets, one per possible Yes/No answer — a single item can require
    // e.g. a photo when answered Yes AND a reason when answered No, both active at once. An empty/
    // null array means no rule for that branch.
    yesActions: json('yesActions').$type<(typeof CHECKLIST_CONDITIONAL_ACTIONS)[number][]>(),
    noActions: json('noActions').$type<(typeof CHECKLIST_CONDITIONAL_ACTIONS)[number][]>(),
    definitionId: varchar('definitionId', { length: 191 })
      .notNull()
      .references(() => checklistDefinitions.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistDefinitionItem_definitionId_idx').on(table.definitionId)],
);

export const checklistDefinitionItemAuditUsers = mysqlTable(
  'ChecklistDefinitionItemAuditUser',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    itemId: varchar('itemId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ChecklistDefinitionItemAuditUser_itemId_userId_key').on(table.itemId, table.userId),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [checklistDefinitionItems.id],
      name: 'ChklistDefItemAuditUser_itemId_fk',
    }).onDelete('cascade'),
  ],
);

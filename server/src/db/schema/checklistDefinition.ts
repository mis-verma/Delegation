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
export const CHECKLIST_RESPONSE_MODES = ['SHARED', 'PER_DEPARTMENT', 'PER_USER'] as const;
export type ChecklistResponseMode = (typeof CHECKLIST_RESPONSE_MODES)[number];

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
    opensTime: varchar('opensTime', { length: 5 }),
    cutoffTime: varchar('cutoffTime', { length: 5 }),
    lateUntilTime: varchar('lateUntilTime', { length: 5 }),
    isActive: boolean('isActive').notNull().default(true),
    assigneeRoles: json('assigneeRoles').$type<(typeof CHECKLIST_ASSIGNEE_ROLES)[number][]>(),
    icon: mysqlEnum('icon', CHECKLIST_ICONS).notNull().default('store'),
    responseMode: mysqlEnum('responseMode', CHECKLIST_RESPONSE_MODES).notNull().default('SHARED'),
    activeWeekdays: json('activeWeekdays').$type<number[]>(),
    version: int('version').notNull().default(1),
    createdBy: varchar('createdBy', { length: 191 }).notNull().references(() => users.id),
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
    section: varchar('section', { length: 120 }),
    requiredImageCount: int('requiredImageCount').notNull().default(0),
    maxImageCount: int('maxImageCount'),
    requiresLivePhoto: boolean('requiresLivePhoto').notNull().default(false),
    isCritical: boolean('isCritical').notNull().default(false),
    itemType: mysqlEnum('itemType', CHECKLIST_ITEM_TYPES).notNull().default('STANDARD'),
    accessories: json('accessories').$type<string[]>(),
    accessoriesFemale: json('accessoriesFemale').$type<string[]>(),
    accessoriesMale: json('accessoriesMale').$type<string[]>(),
    accessoriesByType: json('accessoriesByType').$type<Record<string, string[]>>(),
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
    acceptableAnswers: json('acceptableAnswers').$type<string[]>(),
    acceptableMin: float('acceptableMin'),
    acceptableMax: float('acceptableMax'),
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

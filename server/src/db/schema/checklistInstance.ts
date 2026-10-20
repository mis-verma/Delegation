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
import { users, stores, dressTypes } from './core.js';
import { CAPTURE_METHODS } from './task.js';
import { tickets } from './ticket.js';
import {
  checklistDefinitions,
  CHECKLIST_RECURRENCES,
  CHECKLIST_ITEM_TYPES,
  CHECKLIST_CONDITIONAL_ACTIONS,
  YES_NO_VALUES,
} from './checklistDefinition.js';

export const CHECKLIST_VERIFICATION_STATUSES = ['NOT_SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED'] as const;

export const checklistInstances = mysqlTable(
  'ChecklistInstance',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    definitionId: varchar('definitionId', { length: 191 })
      .notNull()
      .references(() => checklistDefinitions.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 191 }).notNull(),
    recurrence: mysqlEnum('recurrence', CHECKLIST_RECURRENCES).notNull(),
    storeId: varchar('storeId', { length: 191 }).notNull().references(() => stores.id),
    opensTime: varchar('opensTime', { length: 5 }), 
    cutoffTime: varchar('cutoffTime', { length: 5 }), 
    lateUntilTime: varchar('lateUntilTime', { length: 5 }),
    lateEndNotifiedAt: datetime('lateEndNotifiedAt', { mode: 'date' }),
    lateReminderNotifiedAt: datetime('lateReminderNotifiedAt', { mode: 'date' }),
    periodKey: varchar('periodKey', { length: 191 }).notNull(),
    scopeKey: varchar('scopeKey', { length: 191 }).notNull().default(''),
    periodStart: datetime('periodStart', { mode: 'date' }).notNull(),
    periodEnd: datetime('periodEnd', { mode: 'date' }).notNull(),
    generatedAt: datetime('generatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    verificationStatus: mysqlEnum('verificationStatus', CHECKLIST_VERIFICATION_STATUSES)
      .notNull()
      .default('NOT_SUBMITTED'),
    submittedAt: datetime('submittedAt', { mode: 'date' }),
    submittedBy: varchar('submittedBy', { length: 191 }).references(() => users.id),
    verifiedBy: varchar('verifiedBy', { length: 191 }).references(() => users.id),
    verifiedAt: datetime('verifiedAt', { mode: 'date' }),
    verificationNote: text('verificationNote'),
    rejectionCount: int('rejectionCount').notNull().default(0),
    overdueNotifiedAt: datetime('overdueNotifiedAt', { mode: 'date' }),
    draftReminderSentAt: datetime('draftReminderSentAt', { mode: 'date' }),
    submitReminderSentAt: datetime('submitReminderSentAt', { mode: 'date' }),
    completedFirstAt: datetime('completedFirstAt', { mode: 'date' }),
    approvalReminderSentAt: datetime('approvalReminderSentAt', { mode: 'date' }),
    approvalEscalatedAt: datetime('approvalEscalatedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ChecklistInstance_definitionId_storeId_periodKey_scopeKey_key').on(
      table.definitionId,
      table.storeId,
      table.periodKey,
      table.scopeKey,
    ),
    index('ChecklistInstance_periodStart_idx').on(table.periodStart),
    index('ChecklistInstance_storeId_periodStart_idx').on(table.storeId, table.periodStart),
    index('ChecklistInstance_verificationStatus_idx').on(table.verificationStatus),
    index('ChecklistInstance_overdueNotifiedAt_idx').on(table.overdueNotifiedAt),
    index('ChecklistInstance_draftReminderSentAt_idx').on(table.draftReminderSentAt),
  ],
);

export const checklistInstanceAssignees = mysqlTable(
  'ChecklistInstanceAssignee',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    instanceId: varchar('instanceId', { length: 191 })
      .notNull()
      .references(() => checklistInstances.id, { onDelete: 'cascade' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ChecklistInstanceAssignee_instanceId_userId_key').on(table.instanceId, table.userId),
    index('ChecklistInstanceAssignee_userId_idx').on(table.userId),
  ],
);

export const checklistInstanceReviewers = mysqlTable(
  'ChecklistInstanceReviewer',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    instanceId: varchar('instanceId', { length: 191 })
      .notNull()
      .references(() => checklistInstances.id, { onDelete: 'cascade' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ChecklistInstanceReviewer_instanceId_userId_key').on(table.instanceId, table.userId),
    index('ChecklistInstanceReviewer_userId_idx').on(table.userId),
  ],
);

export const checklistInstanceItems = mysqlTable(
  'ChecklistInstanceItem',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    label: varchar('label', { length: 191 }).notNull(),
    order: int('order').notNull().default(0),
    section: varchar('section', { length: 120 }),
    isDone: boolean('isDone').notNull().default(false),
    completedAt: datetime('completedAt', { mode: 'date' }),
    completedBy: varchar('completedBy', { length: 191 }).references(() => users.id),
    requiredImageCount: int('requiredImageCount').notNull().default(0),
    maxImageCount: int('maxImageCount'),
    requiresLivePhoto: boolean('requiresLivePhoto').notNull().default(false),
    isCritical: boolean('isCritical').notNull().default(false),
    itemType: mysqlEnum('itemType', CHECKLIST_ITEM_TYPES).notNull().default('STANDARD'),
    accessories: json('accessories').$type<string[]>(),
    numberEntryUnit: varchar('numberEntryUnit', { length: 191 }),
    numberEntryMin: float('numberEntryMin'),
    numberEntryMax: float('numberEntryMax'),
    ratingScale: int('ratingScale'),
    numericValue: float('numericValue'),
    options: json('options').$type<string[]>(),
    booleanAnswer: mysqlEnum('booleanAnswer', YES_NO_VALUES),
    textValue: text('textValue'),
    dateValue: datetime('dateValue', { mode: 'date' }),
    gpsTargetLat: float('gpsTargetLat'),
    gpsTargetLng: float('gpsTargetLng'),
    gpsRadiusMeters: float('gpsRadiusMeters'),
    gpsLat: float('gpsLat'),
    gpsLng: float('gpsLng'),
    gpsAccuracy: float('gpsAccuracy'),
    gpsCapturedAt: datetime('gpsCapturedAt', { mode: 'date' }),
    signatureLabels: json('signatureLabels').$type<string[]>(),
    signatureValue: text('signatureValue'),
    secondSignatureValue: text('secondSignatureValue'), 
    qrExpectedValue: varchar('qrExpectedValue', { length: 191 }),
    cashExpectedAmount: float('cashExpectedAmount'),
    acceptableAnswers: json('acceptableAnswers').$type<string[]>(),
    acceptableMin: float('acceptableMin'),
    acceptableMax: float('acceptableMax'),
    yesActions: json('yesActions').$type<(typeof CHECKLIST_CONDITIONAL_ACTIONS)[number][]>(),
    noActions: json('noActions').$type<(typeof CHECKLIST_CONDITIONAL_ACTIONS)[number][]>(),
    conditionalReasonValue: text('conditionalReasonValue'),
    remarks: text('remarks'),
    isNotApplicable: boolean('isNotApplicable').notNull().default(false),
    sendBackNote: text('sendBackNote'),
    sendBackCount: int('sendBackCount').notNull().default(0),
    sentBackFrom: varchar('sentBackFrom', { length: 191 }),
    waivedAt: datetime('waivedAt', { mode: 'date' }),
    waivedBy: varchar('waivedBy', { length: 191 }),
    waiveReason: text('waiveReason'),
    definitionItemId: varchar('definitionItemId', { length: 191 }),
    issueId: varchar('issueId', { length: 191 }).references(() => tickets.id),
    reviewTicketId: varchar('reviewTicketId', { length: 191 }).references(() => tickets.id),
    instanceId: varchar('instanceId', { length: 191 })
      .notNull()
      .references(() => checklistInstances.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistInstanceItem_instanceId_idx').on(table.instanceId)],
);

export const checklistInstanceItemSubmissions = mysqlTable(
  'ChecklistInstanceItemSubmission',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    itemId: varchar('itemId', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    remarks: text('remarks'),
    isDone: boolean('isDone').notNull().default(false),
    isNotApplicable: boolean('isNotApplicable').notNull().default(false),
    dressTypeId: varchar('dressTypeId', { length: 191 }).references(() => dressTypes.id, { onDelete: 'set null' }),
    completedAt: datetime('completedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ChecklistInstanceItemSubmission_itemId_userId_key').on(table.itemId, table.userId),
    foreignKey({
      columns: [table.itemId],
      foreignColumns: [checklistInstanceItems.id],
      name: 'ChklistInstItemSubmission_itemId_fk',
    }).onDelete('cascade'),
  ],
);

export const checklistInstanceItemSubmissionAccessories = mysqlTable(
  'ChecklistInstanceItemSubmissionAccessory',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    submissionId: varchar('submissionId', { length: 191 }).notNull(),
    name: varchar('name', { length: 191 }).notNull(),
    checked: boolean('checked').notNull().default(false),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('ChecklistInstanceItemSubmissionAccessory_submissionId_idx').on(table.submissionId),
    foreignKey({
      columns: [table.submissionId],
      foreignColumns: [checklistInstanceItemSubmissions.id],
      name: 'ChklistInstItemSubAccessory_subId_fk',
    }).onDelete('cascade'),
  ],
);

export const INSTANCE_IMAGE_PURPOSES = ['GENERAL', 'CONDITIONAL_YES', 'CONDITIONAL_NO'] as const;

export const checklistInstanceImages = mysqlTable(
  'ChecklistInstanceImage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    sizeBytes: int('sizeBytes').notNull(),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    captureMethod: mysqlEnum('captureMethod', CAPTURE_METHODS).notNull(),
    purpose: mysqlEnum('purpose', INSTANCE_IMAGE_PURPOSES).notNull().default('GENERAL'),
    checklistInstanceItemId: varchar('checklistInstanceItemId', { length: 191 }).notNull(),
    uploadedBy: varchar('uploadedBy', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('ChecklistInstanceImage_checklistInstanceItemId_idx').on(table.checklistInstanceItemId),
    foreignKey({
      columns: [table.checklistInstanceItemId],
      foreignColumns: [checklistInstanceItems.id],
      name: 'ChklistInstImage_instItemId_fk',
    }).onDelete('cascade'),
  ],
);

export const checklistInstanceItemSubmissionImages = mysqlTable(
  'ChecklistInstanceItemSubmissionImage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    sizeBytes: int('sizeBytes').notNull(),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    captureMethod: mysqlEnum('captureMethod', CAPTURE_METHODS).notNull(),
    submissionId: varchar('submissionId', { length: 191 }).notNull(),
    uploadedBy: varchar('uploadedBy', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('ChecklistInstanceItemSubmissionImage_submissionId_idx').on(table.submissionId),
    foreignKey({
      columns: [table.submissionId],
      foreignColumns: [checklistInstanceItemSubmissions.id],
      name: 'ChklistInstItemSubImage_subId_fk',
    }).onDelete('cascade'),
  ],
);

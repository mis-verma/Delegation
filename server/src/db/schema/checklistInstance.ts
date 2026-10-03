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
import { CAPTURE_METHODS } from './task.js';
import { tickets } from './ticket.js';
import {
  checklistDefinitions,
  CHECKLIST_RECURRENCES,
  CHECKLIST_ITEM_TYPES,
  CHECKLIST_CONDITIONAL_ACTIONS,
  YES_NO_VALUES,
} from './checklistDefinition.js';

// PENDING_APPROVAL is the single review stage: a verifier (ADMIN/PC/MANAGER-in-department/named
// reviewer — checklistInstance.service.ts's CAN_VERIFY_BY_ROLE) approves straight into APPROVED or
// rejects back to REJECTED via verify()/PATCH /checklist-instances/:id/verify. Used to be two
// stages (a QC pass into PENDING, then a separate APPROVAL_MANAGER-only sign-off) — collapsed to
// one brief check by request; see git history if the two-stage version is ever needed again.
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
    periodKey: varchar('periodKey', { length: 191 }).notNull(),
    // Which slice of the checklist's people this run belongs to: '' for a shared run, 'dept:<id>' or
    // 'user:<id>' when the checklist's response mode gives each department / person their own run.
    scopeKey: varchar('scopeKey', { length: 191 }).notNull().default(''),
    periodStart: datetime('periodStart', { mode: 'date' }).notNull(),
    periodEnd: datetime('periodEnd', { mode: 'date' }).notNull(),
    generatedAt: datetime('generatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    verificationStatus: mysqlEnum('verificationStatus', CHECKLIST_VERIFICATION_STATUSES)
      .notNull()
      .default('NOT_SUBMITTED'),
    // When the person filling it in pressed Submit (everything done, sent for review), and who. Null
    // until then, and cleared again if the run is reopened. Ticking the last question no longer
    // submits by itself: the person confirms with one button.
    submittedAt: datetime('submittedAt', { mode: 'date' }),
    submittedBy: varchar('submittedBy', { length: 191 }).references(() => users.id),
    verifiedBy: varchar('verifiedBy', { length: 191 }).references(() => users.id),
    verifiedAt: datetime('verifiedAt', { mode: 'date' }),
    verificationNote: text('verificationNote'),
    // Bumped every time a PC/Admin rejects this instance — drives the "first-attempt approval"
    // quality metric in complianceReport (an APPROVED instance only counts toward quality if it
    // was never rejected first) and lets the UI distinguish "never rejected" from "fixed and
    // resubmitted."
    rejectionCount: int('rejectionCount').notNull().default(0),
    // Set once the overdue-notifier sweep has sent its one-time "this is overdue" notification for
    // this instance (assignees + store PCs) — stays null the whole time an instance is on-track or
    // already complete. Lets the hourly sweep query `WHERE overdueNotifiedAt IS NULL` instead of
    // re-notifying every already-flagged instance on every run.
    overdueNotifiedAt: datetime('overdueNotifiedAt', { mode: 'date' }),
    // Set once checklistDraftReminder.job.ts has sent its one-time "you started this but didn't
    // finish" nudge (someone completed at least one item, then stopped, well before the deadline)
    // — same one-shot convention as overdueNotifiedAt, so the same instance is never re-nudged on
    // a later sweep. Deliberately separate from overdueNotifiedAt: a "still on time, please
    // finish" reminder and a "you missed the deadline" alert are different messages that can both
    // legitimately fire for the same instance (draft reminder first, overdue notice later if it's
    // still incomplete).
    draftReminderSentAt: datetime('draftReminderSentAt', { mode: 'date' }),
    // Same one-shot convention for "every question is done but it was never submitted": the person
    // gets one nudge to press Submit, so a finished checklist does not sit there unseen by the reviewer.
    submitReminderSentAt: datetime('submitReminderSentAt', { mode: 'date' }),
    // One-shot stamps for the approval chase (checklistDraftReminder.job.ts): a reminder to the
    // reviewers after 24h in PENDING_APPROVAL, an escalation to Admin/PC after 48h. Both are cleared
    // when the run leaves PENDING_APPROVAL so a resubmission can chase again.
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
    // Per-store analytics: store + period range.
    index('ChecklistInstance_storeId_periodStart_idx').on(table.storeId, table.periodStart),
    // listPendingVerification filters on this column on every PC/Admin/HOD queue poll — without
    // it that query is a full table scan of ChecklistInstance as the table grows.
    index('ChecklistInstance_verificationStatus_idx').on(table.verificationStatus),
    // The overdue-notifier sweep filters on this column every hourly run.
    index('ChecklistInstance_overdueNotifiedAt_idx').on(table.overdueNotifiedAt),
    // The draft-reminder sweep filters on this column every run, same reason as the index above.
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


// Copied from the definition's checklistDefinitionReviewers at generation time (same convention
// as checklistInstanceAssignees) — an explicit per-instance reviewer list, additive on top of the
// role-based verify rule.
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
    // Copied from ChecklistDefinitionItem.isCritical: counts double in compliance.
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
    signatureValue: text('signatureValue'), // PNG data URL
    secondSignatureValue: text('secondSignatureValue'), 
    qrExpectedValue: varchar('qrExpectedValue', { length: 191 }),
    cashExpectedAmount: float('cashExpectedAmount'),
    // Copied from the checklist question (see ChecklistDefinitionItem.acceptableAnswers).
    acceptableAnswers: json('acceptableAnswers').$type<string[]>(),
    acceptableMin: float('acceptableMin'),
    acceptableMax: float('acceptableMax'),
    // Mirrors ChecklistDefinitionItem's two-branch model — copied in at generation time (see
    // checklistInstanceGenerator.job.ts) so this instance keeps the rule even if the definition
    // is edited later.
    yesActions: json('yesActions').$type<(typeof CHECKLIST_CONDITIONAL_ACTIONS)[number][]>(),
    noActions: json('noActions').$type<(typeof CHECKLIST_CONDITIONAL_ACTIONS)[number][]>(),
    conditionalReasonValue: text('conditionalReasonValue'),
    // Free-text note the assignee can leave on any item — required by the client once the item's
    // parent instance is overdue and this item is still not done, so a genuinely-skipped step
    // always carries an explanation instead of just silently sitting incomplete.
    remarks: text('remarks'),
    // "This step doesn't apply here" (no cash drawer at this store, no delivery today). Counts as
    // done for progress and approval, skips the item's own value/photo rules, and always carries
    // a reason in `remarks` so the reviewer sees why it was skipped.
    isNotApplicable: boolean('isNotApplicable').notNull().default(false),
    // Why a reviewer sent THIS question back (see sendBack in checklistInstance.service.ts). Shown on
    // the question until it is completed again, which clears it.
    sendBackNote: text('sendBackNote'),
    // How many times a reviewer has sent THIS question back. Never reset when the question is
    // redone: the compliance reports count a question with sendBackCount > 0 as a failed check even
    // if the second attempt was fine (first-attempt quality).
    sendBackCount: int('sendBackCount').notNull().default(0),
    // The user who had completed the question when it was last sent back (who got it wrong). No FK
    // on purpose: it is history, and must survive that user being removed.
    sentBackFrom: varchar('sentBackFrom', { length: 191 }),
    // The checklist question this run's question was stamped from (ChecklistDefinitionItem.id). It
    // lets an edit to the checklist reach a run that's already started: the run's question is found
    // again even if it was renamed or moved, instead of looking like one question removed and
    // another added. Deliberately NOT a foreign key: taking a question out of the checklist must not
    // touch a run that holds answers to it. Null on runs stamped before this column existed (those
    // are matched by wording instead, see matchRunItems in checklistInstanceGenerator.job.ts).
    definitionItemId: varchar('definitionItemId', { length: 191 }),
    issueId: varchar('issueId', { length: 191 }).references(() => tickets.id),
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
    // "Can't be checked today" (absent, on leave): counts as submitted so the audit can finish, skips
    // the ticks and photos, and always carries the reason in `remarks`. Only with isDone = true.
    isNotApplicable: boolean('isNotApplicable').notNull().default(false),
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

export const checklistInstanceImages = mysqlTable(
  'ChecklistInstanceImage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    sizeBytes: int('sizeBytes').notNull(),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    captureMethod: mysqlEnum('captureMethod', CAPTURE_METHODS).notNull(),
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

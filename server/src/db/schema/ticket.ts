import {
  mysqlTable,
  varchar,
  text,
  int,
  float,
  boolean,
  datetime,
  mysqlEnum,
  index,
  uniqueIndex,
} from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';
import { users, stores, categories, departments } from './core.js';
import { CAPTURE_METHODS, tags } from './task.js';

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'ON_HOLD'] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const ASSIGNMENT_MODES = ['AUTO', 'MANUAL'] as const;
export const TICKET_APPROVAL_STAGES = ['HOD', 'PC'] as const;
export const RESTRICTED_STATUSES = ['IN_PROGRESS', 'ON_HOLD', 'PENDING_APPROVAL'] as const;
export const CHECKLIST_TEMPLATE_TARGETS = ['TASK', 'TICKET'] as const;

export const tickets = mysqlTable(
  'Ticket',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    title: varchar('title', { length: 191 }).notNull(),
    description: text('description').notNull(),
    status: mysqlEnum('status', TICKET_STATUSES).notNull().default('OPEN'),
    priority: mysqlEnum('priority', TICKET_PRIORITIES).notNull().default('MEDIUM'),
    assignmentMode: mysqlEnum('assignmentMode', ASSIGNMENT_MODES).notNull().default('MANUAL'),
    tatHours: float('tatHours'),
    tatDueAt: datetime('tatDueAt', { mode: 'date' }),
    startDate: datetime('startDate', { mode: 'date' }),
    isOverdue: boolean('isOverdue').notNull().default(false),
    closedAt: datetime('closedAt', { mode: 'date' }),
    submittedAt: datetime('submittedAt', { mode: 'date' }),
    reopenCount: int('reopenCount').notNull().default(0),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    storeId: varchar('storeId', { length: 191 }).references(() => stores.id),
    categoryId: varchar('categoryId', { length: 191 }).references(() => categories.id),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    verifiedBy: varchar('verifiedBy', { length: 191 }).references(() => users.id),
    verifiedAt: datetime('verifiedAt', { mode: 'date' }),
    verificationNote: text('verificationNote'),
    dueSoonNotifiedAt: datetime('dueSoonNotifiedAt', { mode: 'date' }),
    overdueNotifiedAt: datetime('overdueNotifiedAt', { mode: 'date' }),
    approvalReminderSentAt: datetime('approvalReminderSentAt', { mode: 'date' }),
    approvalEscalatedAt: datetime('approvalEscalatedAt', { mode: 'date' }),
    overdueEscalatedAt: datetime('overdueEscalatedAt', { mode: 'date' }),
    unassignedNotifiedAt: datetime('unassignedNotifiedAt', { mode: 'date' }),
    headReminderSentAt: datetime('headReminderSentAt', { mode: 'date' }),
    headEscalatedAt: datetime('headEscalatedAt', { mode: 'date' }),
    staleNudgeSentAt: datetime('staleNudgeSentAt', { mode: 'date' }),
    approvalStage: mysqlEnum('approvalStage', TICKET_APPROVAL_STAGES),
    hodApprovedBy: varchar('hodApprovedBy', { length: 191 }).references(() => users.id),
    hodApprovedAt: datetime('hodApprovedAt', { mode: 'date' }),
    awaitingHeadApproval: boolean('awaitingHeadApproval').notNull().default(false),
    assignmentApprovedBy: varchar('assignmentApprovedBy', { length: 191 }).references(() => users.id),
    assignmentApprovedAt: datetime('assignmentApprovedAt', { mode: 'date' }),
    deletedAt: datetime('deletedAt', { mode: 'date' }),
    declinedAt: datetime('declinedAt', { mode: 'date' }),
    declinedBy: varchar('declinedBy', { length: 191 }).references(() => users.id),
    declineReason: text('declineReason'),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('Ticket_userId_createdAt_idx').on(table.userId, table.createdAt),
    index('Ticket_assigneeId_createdAt_idx').on(table.assigneeId, table.createdAt),
    index('Ticket_departmentId_createdAt_idx').on(table.departmentId, table.createdAt),
    index('Ticket_status_createdAt_idx').on(table.status, table.createdAt),
    index('Ticket_storeId_createdAt_idx').on(table.storeId, table.createdAt),
    index('Ticket_deletedAt_idx').on(table.deletedAt),
    index('Ticket_closedAt_idx').on(table.closedAt),
    index('Ticket_createdAt_idx').on(table.createdAt),
    index('Ticket_storeId_closedAt_idx').on(table.storeId, table.closedAt),
    index('Ticket_departmentId_closedAt_idx').on(table.departmentId, table.closedAt),
    index('Ticket_tatDueAt_idx').on(table.tatDueAt),
    index('Ticket_isOverdue_tatDueAt_idx').on(table.isOverdue, table.tatDueAt),
  ],
);

export const ticketTags = mysqlTable(
  'TicketTag',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    tagId: varchar('tagId', { length: 191 }).notNull().references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('TicketTag_ticketId_tagId_key').on(table.ticketId, table.tagId),
    index('TicketTag_tagId_idx').on(table.tagId),
  ],
);

export const ticketReviewers = mysqlTable(
  'TicketReviewer',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id, { onDelete: 'cascade' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('TicketReviewer_ticketId_userId_key').on(table.ticketId, table.userId),
    index('TicketReviewer_userId_idx').on(table.userId),
  ],
);

export const ticketStatusUpdates = mysqlTable(
  'TicketStatusUpdate',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id),
    changedBy: varchar('changedBy', { length: 191 }).notNull().references(() => users.id),
    fromStatus: varchar('fromStatus', { length: 191 }).notNull(),
    toStatus: mysqlEnum('toStatus', RESTRICTED_STATUSES).notNull(),
    remark: text('remark').notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('TicketStatusUpdate_ticketId_idx').on(table.ticketId),
    index('TicketStatusUpdate_toStatus_createdAt_idx').on(table.toStatus, table.createdAt),
  ],
);

export const ticketAttachments = mysqlTable(
  'TicketAttachment',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    sizeBytes: int('sizeBytes').notNull(),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    captureMethod: mysqlEnum('captureMethod', CAPTURE_METHODS).notNull().default('GALLERY'),
    statusUpdateId: varchar('statusUpdateId', { length: 191 }).references(() => ticketStatusUpdates.id),
    ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id),
    uploadedBy: varchar('uploadedBy', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('TicketAttachment_statusUpdateId_idx').on(table.statusUpdateId),
    index('TicketAttachment_ticketId_idx').on(table.ticketId),
  ],
);

export const ticketComments = mysqlTable(
  'TicketComment',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    body: text('body').notNull(),
    ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id),
    authorId: varchar('authorId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TicketComment_ticketId_idx').on(table.ticketId)],
);

export const checklists = mysqlTable('Checklist', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  title: varchar('title', { length: 191 }).notNull(),
  ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

export const checklistItems = mysqlTable(
  'ChecklistItem',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    label: varchar('label', { length: 191 }).notNull(),
    isDone: boolean('isDone').notNull().default(false),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    dueAt: datetime('dueAt', { mode: 'date' }),
    completedAt: datetime('completedAt', { mode: 'date' }),
    checklistId: varchar('checklistId', { length: 191 }).notNull().references(() => checklists.id),
    requiredImageCount: int('requiredImageCount').notNull().default(0),
    maxImageCount: int('maxImageCount'),
    requiresLivePhoto: boolean('requiresLivePhoto').notNull().default(false),
    remarks: text('remarks'),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistItem_checklistId_idx').on(table.checklistId)],
);

export const checklistImages = mysqlTable(
  'ChecklistImage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    sizeBytes: int('sizeBytes').notNull(),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    captureMethod: mysqlEnum('captureMethod', CAPTURE_METHODS).notNull(),
    checklistItemId: varchar('checklistItemId', { length: 191 }).notNull().references(() => checklistItems.id),
    uploadedBy: varchar('uploadedBy', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistImage_checklistItemId_idx').on(table.checklistItemId)],
);

export const checklistTemplates = mysqlTable(
  'ChecklistTemplate',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    appliesTo: mysqlEnum('appliesTo', CHECKLIST_TEMPLATE_TARGETS).notNull(),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    createdBy: varchar('createdBy', { length: 191 }).notNull().references(() => users.id),
    deletedAt: datetime('deletedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistTemplate_deletedAt_idx').on(table.deletedAt)],
);

export const checklistTemplateItems = mysqlTable(
  'ChecklistTemplateItem',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    label: varchar('label', { length: 191 }).notNull(),
    order: int('order').notNull().default(0),
    requiredImageCount: int('requiredImageCount').notNull().default(0),
    maxImageCount: int('maxImageCount'),
    requiresLivePhoto: boolean('requiresLivePhoto').notNull().default(false),
    defaultAssigneeId: varchar('defaultAssigneeId', { length: 191 }).references(() => users.id),
    templateId: varchar('templateId', { length: 191 }).notNull().references(() => checklistTemplates.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistTemplateItem_templateId_idx').on(table.templateId)],
);

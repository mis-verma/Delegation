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

// ---------------------------------------------------------------------------
// Shared enum value arrays
// ---------------------------------------------------------------------------

// PENDING_APPROVAL is the single review stage: a verifier (ADMIN/PC/MANAGER-in-department/named
// reviewer — ticket.service.ts's CAN_VERIFY_BY_ROLE) approves straight into CLOSED or rejects back
// to IN_PROGRESS via verify()/PATCH /tickets/:id/verify. Used to be two stages (a QC pass into
// IN_REVIEW, then a separate APPROVAL_MANAGER-only sign-off) — collapsed to one brief check by
// request; see git history if the two-stage version is ever needed again.
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'PENDING_APPROVAL', 'CLOSED', 'ON_HOLD'] as const;
export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export const ASSIGNMENT_MODES = ['AUTO', 'MANUAL'] as const;
export const RESTRICTED_STATUSES = ['IN_PROGRESS', 'ON_HOLD', 'PENDING_APPROVAL'] as const;
export const CHECKLIST_TEMPLATE_TARGETS = ['TASK', 'TICKET'] as const;

// ---------------------------------------------------------------------------
// Ticket — support/issue ticket raised by a user
// ---------------------------------------------------------------------------
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
    // Recomputed from tatHours by a service-layer helper (was a Mongoose pre('save') hook).
    tatDueAt: datetime('tatDueAt', { mode: 'date' }),
    // The first day the work is meant to happen, when the person picked a range (start to due). Purely
    // informational: the TAT clock still runs from creation to tatDueAt. Null for a due-date-only ticket.
    startDate: datetime('startDate', { mode: 'date' }),
    isOverdue: boolean('isOverdue').notNull().default(false),
    closedAt: datetime('closedAt', { mode: 'date' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    storeId: varchar('storeId', { length: 191 }).references(() => stores.id),
    categoryId: varchar('categoryId', { length: 191 }).references(() => categories.id),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    verifiedBy: varchar('verifiedBy', { length: 191 }).references(() => users.id),
    verifiedAt: datetime('verifiedAt', { mode: 'date' }),
    verificationNote: text('verificationNote'),
    // Soft-delete: remove() sets this instead of deleting the row (and its children) outright, so
    // a ticket and its checklist/attachment/comment/status-update history stay recoverable —
    // same convention as Task (see task.ts's own deletedAt). Every read path in ticket.service.ts
    // (list/getById/update/addStatusUpdate/verify/reports) must AND in `isNull(tickets.deletedAt)`
    // — see that file's NOT_DELETED constant.
    deletedAt: datetime('deletedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('Ticket_userId_createdAt_idx').on(table.userId, table.createdAt),
    index('Ticket_assigneeId_createdAt_idx').on(table.assigneeId, table.createdAt),
    index('Ticket_departmentId_createdAt_idx').on(table.departmentId, table.createdAt),
    index('Ticket_status_createdAt_idx').on(table.status, table.createdAt),
    // ticket.service.ts's visibilityFilter uses a bare eq(tickets.storeId, ...) as the SENIOR
    // role's sole filter on the main ticket-list endpoint — with no storeId-leading index that's
    // a full table scan on every page load for that role.
    index('Ticket_storeId_createdAt_idx').on(table.storeId, table.createdAt),
    // Every read path filters on this — see ticket.service.ts's NOT_DELETED.
    index('Ticket_deletedAt_idx').on(table.deletedAt),
    // Analytics reports bucket closed tickets by closedAt and open ones by createdAt, org-wide or
    // per store / department.
    index('Ticket_closedAt_idx').on(table.closedAt),
    index('Ticket_createdAt_idx').on(table.createdAt),
    index('Ticket_storeId_closedAt_idx').on(table.storeId, table.closedAt),
    index('Ticket_departmentId_closedAt_idx').on(table.departmentId, table.closedAt),
  ],
);

// ---------------------------------------------------------------------------
// TicketTag — labels a Ticket, reusing Task's own `tags` table so a label ("Travel",
// "Billing", ...) is one shared org-wide vocabulary rather than two parallel ones.
// Byte-identical shape to task.ts's TaskTag join table.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// TicketReviewer — explicit reviewer, additive on top of the role-based verify rule (ADMIN/PC
// always, MANAGER/HOD within the ticket's own department — see ticket.service.ts's
// assertCanVerify). Same convention as TaskReviewer / ChecklistDefinitionReviewer.
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// TicketStatusUpdate — audit trail entry for a Ticket's status changes
// ---------------------------------------------------------------------------
export const ticketStatusUpdates = mysqlTable(
  'TicketStatusUpdate',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id),
    changedBy: varchar('changedBy', { length: 191 }).notNull().references(() => users.id),
    // Plain string, not enum-constrained (unlike toStatus) — matches source.
    fromStatus: varchar('fromStatus', { length: 191 }).notNull(),
    toStatus: mysqlEnum('toStatus', RESTRICTED_STATUSES).notNull(),
    remark: text('remark').notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TicketStatusUpdate_ticketId_idx').on(table.ticketId)],
);

// ---------------------------------------------------------------------------
// TicketAttachment — file uploaded to a Ticket (optionally tied to a status update)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// TicketComment — a comment on a Ticket
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Checklist — ticket-side checklist (distinct from ChecklistDefinition/Instance)
// ---------------------------------------------------------------------------
export const checklists = mysqlTable('Checklist', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  title: varchar('title', { length: 191 }).notNull(),
  ticketId: varchar('ticketId', { length: 191 }).notNull().references(() => tickets.id),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// ChecklistItem — a single line item within a ticket-side Checklist
// ---------------------------------------------------------------------------
export const checklistItems = mysqlTable(
  'ChecklistItem',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    label: varchar('label', { length: 191 }).notNull(),
    isDone: boolean('isDone').notNull().default(false),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    dueAt: datetime('dueAt', { mode: 'date' }),
    // Kept in sync with isDone by a service-layer helper (was a Mongoose pre('save') hook).
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

// ---------------------------------------------------------------------------
// ChecklistImage — photo proof captured against a ticket-side ChecklistItem
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// ChecklistTemplate — reusable checklist blueprint for Task or Ticket
// ---------------------------------------------------------------------------
export const checklistTemplates = mysqlTable(
  'ChecklistTemplate',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    appliesTo: mysqlEnum('appliesTo', CHECKLIST_TEMPLATE_TARGETS).notNull(),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    createdBy: varchar('createdBy', { length: 191 }).notNull().references(() => users.id),
    // Soft-delete: remove() sets this instead of deleting the row (and its ChecklistTemplateItem
    // children) outright — same convention as Task/Ticket/ChecklistDefinition. Every read path in
    // checklistTemplate.service.ts must AND in `isNull(checklistTemplates.deletedAt)`.
    deletedAt: datetime('deletedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ChecklistTemplate_deletedAt_idx').on(table.deletedAt)],
);

// ---------------------------------------------------------------------------
// ChecklistTemplateItem — a line item within a ChecklistTemplate
// ---------------------------------------------------------------------------
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

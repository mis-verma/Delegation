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
  type AnyMySqlColumn,
} from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';
import { users, departments, projects } from './core.js';

// ---------------------------------------------------------------------------
// Shared enum value arrays
// ---------------------------------------------------------------------------

// 'draft' sits before the normal workflow: a delegation saved before it's ready to assign/act on,
// visible only to whoever created it (see task.service.ts#list's status === 'draft' branch) until
// it's "published" — an ordinary status-change PATCH to 'todo', the same mechanism every other
// status move already goes through.
//
// 'pending_approval' is the single review stage: a verifier (ADMIN/PC/MANAGER-in-department/named
// reviewer — task.service.ts's CAN_VERIFY_BY_ROLE) approves straight into done or rejects back to
// in_progress via verify()/PATCH /tasks/:id/verify. Used to be two stages (a QC pass into
// pending_verification, then a separate APPROVAL_MANAGER-only sign-off) — collapsed to one brief
// check by request; see git history if the two-stage version is ever needed again.
export const TASK_STATUSES = ['draft', 'todo', 'in_progress', 'pending_approval', 'done'] as const;
export const TASK_CATEGORIES = ['issue', 'delegation'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const TASK_REMINDER_CHANNELS = ['notification', 'alarm', 'email', 'sms'] as const;
// Reused (imported) by ChecklistImage, ChecklistInstanceImage,
// ChecklistInstanceItemSubmissionImage, TicketAttachment.
export const CAPTURE_METHODS = ['LIVE', 'GALLERY'] as const;
export const AI_INPUT_MODES = ['voice', 'text'] as const;
export const AI_CHANNELS = ['whatsapp', 'web'] as const;
export const TODO_PRIORITIES = ['low', 'medium', 'high'] as const;
export const SMART_TASK_CONVERSATION_STATUSES = ['in_progress', 'completed', 'abandoned'] as const;
export const MESSAGE_SENDERS = ['bot', 'user'] as const;
export const CONVERSATION_CHANNELS = ['whatsapp'] as const;
// Raw webhook source, for ProcessedInboundMessage's dedupe key below — distinct from
// CONVERSATION_CHANNELS, which is the conversation model's own channel value (currently only ever
// "whatsapp" there, whichever provider actually delivered it).
export const INBOUND_MESSAGE_CHANNELS = ['whatsapp', 'doubletick'] as const;
export const CONVERSATION_SLOTS = ['assignee', 'department', 'dueDate', 'priority'] as const;
// PendingTaskConversation.draft.category uses a different value set than
// Task.category ("delegated_task" vs "delegation") — kept as a distinct enum.
export const DRAFT_TASK_CATEGORIES = ['issue', 'delegated_task'] as const;

// Task.aiMeta — "Mongo's answer to Postgres JSONB" per source comment; kept as
// a single JSON column rather than flattened columns, matching source intent.
export type TaskAiMeta = {
  rawInput: string | null;
  inputMode: (typeof AI_INPUT_MODES)[number] | null;
  channel: (typeof AI_CHANNELS)[number] | null;
  extractedAssigneeName: string | null;
  extractedDepartment: string | null;
  confidence: number | null;
  model: string | null;
};

// ---------------------------------------------------------------------------
// Task — core work item (delegation or issue)
// ---------------------------------------------------------------------------
export const tasks = mysqlTable(
  'Task',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    title: varchar('title', { length: 191 }).notNull(),
    description: text('description'),
    status: mysqlEnum('status', TASK_STATUSES).notNull().default('todo'),
    category: mysqlEnum('category', TASK_CATEGORIES).notNull().default('delegation'),
    priority: mysqlEnum('priority', TASK_PRIORITIES).notNull().default('medium'),
    startDate: datetime('startDate', { mode: 'date' }),
    dueDate: datetime('dueDate', { mode: 'date' }),
    reminderMinutesBefore: int('reminderMinutesBefore'),
    reminderChannel: mysqlEnum('reminderChannel', TASK_REMINDER_CHANNELS).notNull().default('notification'),
    reminderSentAt: datetime('reminderSentAt', { mode: 'date' }),
    projectId: varchar('projectId', { length: 191 }).references(() => projects.id),
    // Self-referencing FK for subtasks: a task with a non-null parentTaskId is
    // a subtask of another Task. Return type annotated to break the circular
    // type inference `tasks` would otherwise have on itself.
    parentTaskId: varchar('parentTaskId', { length: 191 }).references((): AnyMySqlColumn => tasks.id),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    verifiedBy: varchar('verifiedBy', { length: 191 }).references(() => users.id),
    verifiedAt: datetime('verifiedAt', { mode: 'date' }),
    verificationNote: text('verificationNote'),
    submittedAt: datetime('submittedAt', { mode: 'date' }),
    // Renamed from Mongoose `submisssionNote` (triple-s typo, confirmed unused elsewhere).
    submissionNote: text('submissionNote'),
    aiMeta: json('aiMeta').$type<TaskAiMeta>(),
    // Soft-delete: remove() sets this instead of deleting the row (and its children) outright, so
    // a delegation and its checklist/attachment/comment history stay recoverable and the audit
    // trail's DELETE `before` snapshot stops being the only record it ever existed. Every read path
    // (list/getById/update/verify/reports) must AND in `isNull(tasks.deletedAt)` — see NOT_DELETED
    // below — or a "deleted" task keeps showing up everywhere.
    deletedAt: datetime('deletedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('Task_userId_createdAt_idx').on(table.userId, table.createdAt),
    index('Task_assigneeId_createdAt_idx').on(table.assigneeId, table.createdAt),
    index('Task_departmentId_createdAt_idx').on(table.departmentId, table.createdAt),
    index('Task_status_createdAt_idx').on(table.status, table.createdAt),
    index('Task_category_status_createdAt_idx').on(table.category, table.status, table.createdAt),
    index('Task_parentTaskId_idx').on(table.parentTaskId),
    // Mongoose also indexed {additionalAssigneeIds:1,createdAt:-1}; that array
    // now lives in the taskAdditionalAssignees junction table below, so the
    // equivalent index is on that table's userId column instead.
  ],
);

// Task.additionalAssigneeIds — many-to-many junction (Task <-> User)
export const taskAdditionalAssignees = mysqlTable(
  'TaskAdditionalAssignee',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('TaskAdditionalAssignee_taskId_userId_key').on(table.taskId, table.userId),
    index('TaskAdditionalAssignee_userId_idx').on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// TaskDependency — many-to-many "blocked by" relationship between Tasks.
// A row means: taskId cannot start/complete until dependsOnTaskId is done
// (app-layer enforced; MySQL cannot express "done" as a FK constraint).
// ---------------------------------------------------------------------------
export const taskDependencies = mysqlTable(
  'TaskDependency',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    dependsOnTaskId: varchar('dependsOnTaskId', { length: 191 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('TaskDependency_taskId_dependsOnTaskId_key').on(table.taskId, table.dependsOnTaskId),
    index('TaskDependency_dependsOnTaskId_idx').on(table.dependsOnTaskId),
  ],
);

// ---------------------------------------------------------------------------
// Tag — free-form label, reusable across Tasks
// ---------------------------------------------------------------------------
export const tags = mysqlTable(
  'Tag',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    color: varchar('color', { length: 191 }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('Tag_name_key').on(table.name)],
);

// Task <-> Tag many-to-many junction
export const taskTags = mysqlTable(
  'TaskTag',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    tagId: varchar('tagId', { length: 191 }).notNull().references(() => tags.id, { onDelete: 'cascade' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('TaskTag_taskId_tagId_key').on(table.taskId, table.tagId),
    index('TaskTag_tagId_idx').on(table.tagId),
  ],
);

// ---------------------------------------------------------------------------
// TaskAttachment — file uploaded directly to a Task
// ---------------------------------------------------------------------------
export const taskAttachments = mysqlTable(
  'TaskAttachment',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    sizeBytes: int('sizeBytes').notNull(),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id),
    uploadedBy: varchar('uploadedBy', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TaskAttachment_taskId_idx').on(table.taskId)],
);

// ---------------------------------------------------------------------------
// TaskReviewer — explicit reviewer, additive on top of the role-based verify rule (ADMIN/PC
// always, MANAGER/HOD within the task's own department — see task.service.ts's assertCanVerify).
// Naming someone here lets them approve/reject this specific task regardless of role or
// department, same convention as ChecklistDefinitionReviewer/ChecklistInstanceReviewer.
// ---------------------------------------------------------------------------
export const taskReviewers = mysqlTable(
  'TaskReviewer',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('TaskReviewer_taskId_userId_key').on(table.taskId, table.userId),
    index('TaskReviewer_userId_idx').on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// TaskChecklist — a checklist attached to a Task
// ---------------------------------------------------------------------------
export const taskChecklists = mysqlTable('TaskChecklist', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  title: varchar('title', { length: 191 }).notNull(),
  taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// TaskChecklistItem — a single line item within a TaskChecklist
// ---------------------------------------------------------------------------
export const taskChecklistItems = mysqlTable(
  'TaskChecklistItem',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    label: varchar('label', { length: 191 }).notNull(),
    isDone: boolean('isDone').notNull().default(false),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    dueAt: datetime('dueAt', { mode: 'date' }),
    // Kept in sync with isDone by a service-layer helper (was a Mongoose pre('save') hook).
    completedAt: datetime('completedAt', { mode: 'date' }),
    taskChecklistId: varchar('taskChecklistId', { length: 191 }).notNull().references(() => taskChecklists.id),
    requiredImageCount: int('requiredImageCount').notNull().default(0),
    maxImageCount: int('maxImageCount'),
    requiresLivePhoto: boolean('requiresLivePhoto').notNull().default(false),
    remarks: text('remarks'),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TaskChecklistItem_taskChecklistId_idx').on(table.taskChecklistId)],
);

// ---------------------------------------------------------------------------
// TaskImage — photo proof captured against a TaskChecklistItem
// ---------------------------------------------------------------------------
export const taskImages = mysqlTable(
  'TaskImage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    sizeBytes: int('sizeBytes').notNull(),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    captureMethod: mysqlEnum('captureMethod', CAPTURE_METHODS).notNull(),
    taskChecklistItemId: varchar('taskChecklistItemId', { length: 191 }).notNull().references(() => taskChecklistItems.id),
    uploadedBy: varchar('uploadedBy', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TaskImage_taskChecklistItemId_idx').on(table.taskChecklistItemId)],
);

// ---------------------------------------------------------------------------
// TaskComment — a comment on a Task (location embed flattened to columns)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// TaskStatusUpdate — audit trail entry for a Task's status changes.
//
// Mirrors TicketStatusUpdate: tickets have always required a remark to move status and kept the
// history; delegations changed status with nothing recorded, so there was no way to see who moved
// a delegation, when, or why. `remark` is NOT NULL for the same reason it is on tickets — an entry
// with no explanation is the thing this table exists to prevent.
// ---------------------------------------------------------------------------
export const taskStatusUpdates = mysqlTable(
  'TaskStatusUpdate',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id),
    changedBy: varchar('changedBy', { length: 191 }).notNull().references(() => users.id),
    fromStatus: mysqlEnum('fromStatus', TASK_STATUSES).notNull(),
    toStatus: mysqlEnum('toStatus', TASK_STATUSES).notNull(),
    remark: text('remark').notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TaskStatusUpdate_taskId_createdAt_idx').on(table.taskId, table.createdAt)],
);

export const taskComments = mysqlTable(
  'TaskComment',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id),
    authorId: varchar('authorId', { length: 191 }).notNull().references(() => users.id),
    body: text('body').notNull().default(''),
    locationLat: float('locationLat'),
    locationLng: float('locationLng'),
    locationLabel: varchar('locationLabel', { length: 191 }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TaskComment_taskId_createdAt_idx').on(table.taskId, table.createdAt)],
);

// TaskComment.attachments — embedded array with no identity of its own in the
// source; promoted to a real child table with cascading delete.
export const taskCommentAttachments = mysqlTable(
  'TaskCommentAttachment',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    commentId: varchar('commentId', { length: 191 }).notNull().references(() => taskComments.id, { onDelete: 'cascade' }),
    url: varchar('url', { length: 2048 }).notNull(),
    originalFilename: varchar('originalFilename', { length: 191 }),
    mimeType: varchar('mimeType', { length: 191 }).notNull(),
    sizeBytes: int('sizeBytes').notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('TaskCommentAttachment_commentId_idx').on(table.commentId)],
);

// ---------------------------------------------------------------------------
// Todo — personal, owner-only todo item (unrelated to Task workflow)
// ---------------------------------------------------------------------------
export const todos = mysqlTable(
  'Todo',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    text: varchar('text', { length: 500 }).notNull(),
    completed: boolean('completed').notNull().default(false),
    dueDate: datetime('dueDate', { mode: 'date' }),
    priority: mysqlEnum('priority', TODO_PRIORITIES).notNull().default('medium'),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  // Every read in todo.service.ts (listForUser/update/remove) filters on userId — with no index
  // at all here, every one of those was a full table scan.
  (table) => [index('Todo_userId_idx').on(table.userId)],
);

// ---------------------------------------------------------------------------
// SmartTaskConversation — AI-assisted chat that may result in a created Task
// ---------------------------------------------------------------------------
export const smartTaskConversations = mysqlTable(
  'SmartTaskConversation',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    status: mysqlEnum('status', SMART_TASK_CONVERSATION_STATUSES).notNull().default('in_progress'),
    resultingTaskId: varchar('resultingTaskId', { length: 191 }).references(() => tasks.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('SmartTaskConversation_userId_createdAt_idx').on(table.userId, table.createdAt)],
);

// SmartTaskConversation.messages — embedded array promoted to a child table
// with an explicit ordering column (timestamp) and cascading delete.
export const smartTaskConversationMessages = mysqlTable(
  'SmartTaskConversationMessage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    // No `.references()` here (kept plain) — the default FK constraint name
    // Drizzle would generate exceeds MySQL's 64-char identifier limit; the
    // constraint is instead declared explicitly below with a short name.
    conversationId: varchar('conversationId', { length: 191 }).notNull(),
    from: mysqlEnum('from', MESSAGE_SENDERS).notNull(),
    text: text('text').notNull(),
    timestamp: datetime('timestamp', { mode: 'date' }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('SmartTaskConversationMessage_conversationId_timestamp_idx').on(table.conversationId, table.timestamp),
    foreignKey({
      columns: [table.conversationId],
      foreignColumns: [smartTaskConversations.id],
      name: 'SmartTaskConvMsg_conversationId_fk',
    }).onDelete('cascade'),
  ],
);

// ---------------------------------------------------------------------------
// PendingTaskConversation — in-progress WhatsApp/bot task-creation flow
// (embedded `draft` sub-document flattened to draft-prefixed columns)
// ---------------------------------------------------------------------------
export const pendingTaskConversations = mysqlTable(
  'PendingTaskConversation',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    phone: varchar('phone', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    channel: mysqlEnum('channel', CONVERSATION_CHANNELS).notNull().default('whatsapp'),
    pendingSlot: mysqlEnum('pendingSlot', CONVERSATION_SLOTS).notNull(),
    slotQueue: json('slotQueue').$type<(typeof CONVERSATION_SLOTS)[number][]>().notNull().default([]),

    // --- flattened `draft` embedded object ---
    draftTitle: varchar('draftTitle', { length: 191 }).notNull(),
    draftContext: text('draftContext').notNull().default(''),
    draftCategory: mysqlEnum('draftCategory', DRAFT_TASK_CATEGORIES).notNull(),
    draftPriority: mysqlEnum('draftPriority', TASK_PRIORITIES).notNull(),
    draftDueDate: datetime('draftDueDate', { mode: 'date' }),
    draftAssigneeId: varchar('draftAssigneeId', { length: 191 }).references(() => users.id),
    draftAssigneeName: varchar('draftAssigneeName', { length: 191 }).notNull().default(''),
    draftDepartmentId: varchar('draftDepartmentId', { length: 191 }).references(() => departments.id),
    draftDepartmentName: varchar('draftDepartmentName', { length: 191 }).notNull().default(''),
    draftRawInput: text('draftRawInput').notNull(),
    draftInputMode: mysqlEnum('draftInputMode', AI_INPUT_MODES).notNull(),
    draftConfidence: float('draftConfidence'),
    draftWonBy: varchar('draftWonBy', { length: 191 }),

    // TTL target in Mongo (`{expireAfterSeconds: 0}`); MySQL has no native TTL —
    // a scheduled cleanup job must run `DELETE ... WHERE expiresAt < NOW()`.
    expiresAt: datetime('expiresAt', { mode: 'date' }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('PendingTaskConversation_phone_key').on(table.phone),
    index('PendingTaskConversation_expiresAt_idx').on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// ProcessedInboundMessage — dedupe record for WhatsApp/DoubleTick webhook deliveries
// ---------------------------------------------------------------------------
// Meta and DoubleTick both retry a webhook delivery on any hiccup on their end (timeout, 5xx,
// slow ack), and neither guarantees at-most-once delivery. Both controllers ack immediately with
// res.sendStatus(200) then do all the real work async — with no dedupe, two deliveries of the
// same message that race each other can both find "no active conversation" and both create a
// task. Claiming the (channel, messageId) pair here first, before doing anything else, is what
// makes a duplicate delivery a no-op instead of a duplicate task.
export const processedInboundMessages = mysqlTable(
  'ProcessedInboundMessage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    channel: mysqlEnum('channel', INBOUND_MESSAGE_CHANNELS).notNull(),
    messageId: varchar('messageId', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('ProcessedInboundMessage_channel_messageId_key').on(table.channel, table.messageId),
  ],
);

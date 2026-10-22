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

export const TASK_STATUSES = ['draft', 'todo', 'in_progress', 'pending_approval', 'done', 'on_hold'] as const;
export const TASK_CATEGORIES = ['issue', 'delegation'] as const;
export const TASK_PRIORITIES = ['low', 'medium', 'high'] as const;
export const TASK_REMINDER_CHANNELS = ['notification', 'alarm', 'email', 'sms'] as const;
export const CAPTURE_METHODS = ['LIVE', 'GALLERY'] as const;
export const AI_INPUT_MODES = ['voice', 'text'] as const;
export const AI_CHANNELS = ['whatsapp', 'web'] as const;
export const TODO_PRIORITIES = ['low', 'medium', 'high'] as const;
export const SMART_TASK_CONVERSATION_STATUSES = ['in_progress', 'completed', 'abandoned'] as const;
export const MESSAGE_SENDERS = ['bot', 'user'] as const;
export const CONVERSATION_CHANNELS = ['whatsapp'] as const;
export const INBOUND_MESSAGE_CHANNELS = ['whatsapp', 'doubletick'] as const;
export const CONVERSATION_SLOTS = ['assignee', 'department', 'dueDate', 'priority'] as const;
export const DRAFT_TASK_CATEGORIES = ['issue', 'delegated_task'] as const;

export type TaskAiMeta = {
  rawInput: string | null;
  inputMode: (typeof AI_INPUT_MODES)[number] | null;
  channel: (typeof AI_CHANNELS)[number] | null;
  extractedAssigneeName: string | null;
  extractedDepartment: string | null;
  confidence: number | null;
  model: string | null;
};

export const TASK_APPROVAL_STAGES = ['HOD', 'PC'] as const;

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
    parentTaskId: varchar('parentTaskId', { length: 191 }).references((): AnyMySqlColumn => tasks.id),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    overdueNotifiedAt: datetime('overdueNotifiedAt', { mode: 'date' }),
    approvalReminderSentAt: datetime('approvalReminderSentAt', { mode: 'date' }),
    approvalEscalatedAt: datetime('approvalEscalatedAt', { mode: 'date' }),
    overdueEscalatedAt: datetime('overdueEscalatedAt', { mode: 'date' }),
    unassignedNotifiedAt: datetime('unassignedNotifiedAt', { mode: 'date' }),
    headReminderSentAt: datetime('headReminderSentAt', { mode: 'date' }),
    headEscalatedAt: datetime('headEscalatedAt', { mode: 'date' }),
    awaitingHeadApproval: boolean('awaitingHeadApproval').notNull().default(false),
    assignmentApprovedBy: varchar('assignmentApprovedBy', { length: 191 }).references(() => users.id),
    assignmentApprovedAt: datetime('assignmentApprovedAt', { mode: 'date' }),
    declinedAt: datetime('declinedAt', { mode: 'date' }),
    declinedBy: varchar('declinedBy', { length: 191 }).references(() => users.id),
    declineReason: text('declineReason'),
    approvalStage: mysqlEnum('approvalStage', TASK_APPROVAL_STAGES),
    hodApprovedBy: varchar('hodApprovedBy', { length: 191 }).references(() => users.id),
    hodApprovedAt: datetime('hodApprovedAt', { mode: 'date' }),
    verifiedBy: varchar('verifiedBy', { length: 191 }).references(() => users.id),
    verifiedAt: datetime('verifiedAt', { mode: 'date' }),
    verificationNote: text('verificationNote'),
    submittedAt: datetime('submittedAt', { mode: 'date' }),
    submissionNote: text('submissionNote'),
    aiMeta: json('aiMeta').$type<TaskAiMeta>(),
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
    index('Task_createdAt_idx').on(table.createdAt),
  ],
);

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

export const taskChecklists = mysqlTable('TaskChecklist', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  title: varchar('title', { length: 191 }).notNull(),
  taskId: varchar('taskId', { length: 191 }).notNull().references(() => tasks.id),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

export const taskChecklistItems = mysqlTable(
  'TaskChecklistItem',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    label: varchar('label', { length: 191 }).notNull(),
    isDone: boolean('isDone').notNull().default(false),
    assigneeId: varchar('assigneeId', { length: 191 }).references(() => users.id),
    dueAt: datetime('dueAt', { mode: 'date' }),
    completedAt: datetime('completedAt', { mode: 'date' }),
    taskChecklistId: varchar('taskChecklistId', { length: 191 }).notNull().references(() => taskChecklists.id),
    requiredImageCount: int('requiredImageCount').notNull().default(0),
    maxImageCount: int('maxImageCount'),
    requiresLivePhoto: boolean('requiresLivePhoto').notNull().default(false),
    remarks: text('remarks'),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('TaskChecklistItem_taskChecklistId_idx').on(table.taskChecklistId),
    index('TaskChecklistItem_createdAt_idx').on(table.createdAt),
  ],
);

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
  (table) => [index('Todo_userId_idx').on(table.userId)],
);

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

export const smartTaskConversationMessages = mysqlTable(
  'SmartTaskConversationMessage',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
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

export const pendingTaskConversations = mysqlTable(
  'PendingTaskConversation',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    phone: varchar('phone', { length: 191 }).notNull(),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    channel: mysqlEnum('channel', CONVERSATION_CHANNELS).notNull().default('whatsapp'),
    pendingSlot: mysqlEnum('pendingSlot', CONVERSATION_SLOTS).notNull(),
    slotQueue: json('slotQueue').$type<(typeof CONVERSATION_SLOTS)[number][]>().notNull().default([]),

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

    expiresAt: datetime('expiresAt', { mode: 'date' }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex('PendingTaskConversation_phone_key').on(table.phone),
    index('PendingTaskConversation_expiresAt_idx').on(table.expiresAt),
  ],
);

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

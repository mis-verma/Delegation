import { relations } from 'drizzle-orm';
import {
  stores,
  departments,
  users,
  refreshTokens,
  passwordResetTokens,
  categories,
  categoryAssignees,
  events,
  projects,
  projectMembers,
  notifications,
  // auditLogs is intentionally omitted: entityType/entityId is a true
  // polymorphic reference with no single target table, and actorId is a
  // plain string (not a FK to users) — neither can be modeled with
  // relations().
} from './core.js';
import {
  tasks,
  taskAdditionalAssignees,
  taskDependencies,
  tags,
  taskTags,
  taskAttachments,
  taskChecklists,
  taskChecklistItems,
  taskImages,
  taskComments,
  taskStatusUpdates,
  taskCommentAttachments,
  todos,
  smartTaskConversations,
  smartTaskConversationMessages,
  pendingTaskConversations,
} from './task.js';
import {
  tickets,
  ticketTags,
  ticketStatusUpdates,
  ticketAttachments,
  ticketComments,
  checklists,
  checklistItems,
  checklistImages,
  checklistTemplates,
  checklistTemplateItems,
} from './ticket.js';
import {
  checklistDefinitions,
  checklistDefinitionStores,
  checklistDefinitionAssignees,
  checklistDefinitionItems,
  checklistDefinitionItemAuditUsers,
} from './checklistDefinition.js';
import {
  checklistInstances,
  checklistInstanceAssignees,
  checklistInstanceItems,
  checklistInstanceItemSubmissions,
  checklistInstanceItemSubmissionAccessories,
  checklistInstanceImages,
  checklistInstanceItemSubmissionImages,
} from './checklistInstance.js';

// ===========================================================================
// core.ts relations
// ===========================================================================

export const storesRelations = relations(stores, ({ many }) => ({
  departments: many(departments),
  users: many(users),
  tickets: many(tickets),
  checklistInstances: many(checklistInstances),
  checklistDefinitionLinks: many(checklistDefinitionStores),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  store: one(stores, { fields: [departments.storeId], references: [stores.id] }),
  users: many(users),
  categories: many(categories),
  tasks: many(tasks),
  tickets: many(tickets),
  checklistTemplates: many(checklistTemplates),
  pendingTaskConversationDrafts: many(pendingTaskConversations),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  department: one(departments, { fields: [users.departmentId], references: [departments.id] }),
  store: one(stores, { fields: [users.storeId], references: [stores.id] }),

  refreshTokens: many(refreshTokens),
  passwordResetTokens: many(passwordResetTokens),
  createdEvents: many(events),
  ownedProjects: many(projects),
  projectMemberLinks: many(projectMembers),
  categoryAssigneeLinks: many(categoryAssignees),
  notifications: many(notifications),
  todos: many(todos),
  smartTaskConversations: many(smartTaskConversations),

  // Task domain — Task has 3 separate FKs to User, disambiguated by relationName.
  createdTasks: many(tasks, { relationName: 'TaskCreator' }),
  assignedTasks: many(tasks, { relationName: 'TaskAssignee' }),
  verifiedTasks: many(tasks, { relationName: 'TaskVerifier' }),
  additionalAssignedTaskLinks: many(taskAdditionalAssignees),
  uploadedTaskAttachments: many(taskAttachments),
  assignedTaskChecklistItems: many(taskChecklistItems),
  uploadedTaskImages: many(taskImages),
  taskComments: many(taskComments),

  // PendingTaskConversation has 2 separate FKs to User, disambiguated by relationName.
  pendingTaskConversations: many(pendingTaskConversations, { relationName: 'PendingConversationUser' }),
  draftAssignedPendingTaskConversations: many(pendingTaskConversations, {
    relationName: 'PendingConversationDraftAssignee',
  }),

  // Ticket domain — Ticket has 3 separate FKs to User, disambiguated by relationName.
  raisedTickets: many(tickets, { relationName: 'TicketRaiser' }),
  assignedTickets: many(tickets, { relationName: 'TicketAssignee' }),
  verifiedTickets: many(tickets, { relationName: 'TicketVerifier' }),
  uploadedTicketAttachments: many(ticketAttachments),
  ticketComments: many(ticketComments),
  changedTicketStatusUpdates: many(ticketStatusUpdates),
  changedTaskStatusUpdates: many(taskStatusUpdates),
  assignedChecklistItems: many(checklistItems),
  uploadedChecklistImages: many(checklistImages),
  createdChecklistTemplates: many(checklistTemplates),
  defaultAssignedChecklistTemplateItems: many(checklistTemplateItems),

  // Recurring checklist domain
  createdChecklistDefinitions: many(checklistDefinitions),
  checklistDefinitionAssigneeLinks: many(checklistDefinitionAssignees),
  checklistDefinitionItemAuditLinks: many(checklistDefinitionItemAuditUsers),
  verifiedChecklistInstances: many(checklistInstances),
  checklistInstanceAssigneeLinks: many(checklistInstanceAssignees),
  completedChecklistInstanceItems: many(checklistInstanceItems),
  checklistInstanceItemSubmissions: many(checklistInstanceItemSubmissions),
  uploadedChecklistInstanceImages: many(checklistInstanceImages),
  uploadedChecklistInstanceItemSubmissionImages: many(checklistInstanceItemSubmissionImages),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const passwordResetTokensRelations = relations(passwordResetTokens, ({ one }) => ({
  user: one(users, { fields: [passwordResetTokens.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  department: one(departments, { fields: [categories.departmentId], references: [departments.id] }),
  assigneeLinks: many(categoryAssignees),
  tickets: many(tickets),
}));

export const categoryAssigneesRelations = relations(categoryAssignees, ({ one }) => ({
  category: one(categories, { fields: [categoryAssignees.categoryId], references: [categories.id] }),
  user: one(users, { fields: [categoryAssignees.userId], references: [users.id] }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  creator: one(users, { fields: [events.createdBy], references: [users.id] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, { fields: [projects.ownerId], references: [users.id] }),
  memberLinks: many(projectMembers),
  tasks: many(tasks),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
  user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, { fields: [notifications.recipientId], references: [users.id] }),
  // These 3 targets have no `.references()` at the column level (declared plain
  // to avoid a circular file import — see core.ts), but relations() metadata
  // can still describe the logical join for `db.query` `with` usage.
  ticket: one(tickets, { fields: [notifications.ticketId], references: [tickets.id] }),
  task: one(tasks, { fields: [notifications.taskId], references: [tasks.id] }),
  checklistInstance: one(checklistInstances, {
    fields: [notifications.checklistInstanceId],
    references: [checklistInstances.id],
  }),
}));

// ===========================================================================
// task.ts relations
// ===========================================================================

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  creator: one(users, { fields: [tasks.userId], references: [users.id], relationName: 'TaskCreator' }),
  assignee: one(users, { fields: [tasks.assigneeId], references: [users.id], relationName: 'TaskAssignee' }),
  verifier: one(users, { fields: [tasks.verifiedBy], references: [users.id], relationName: 'TaskVerifier' }),
  project: one(projects, { fields: [tasks.projectId], references: [projects.id] }),
  department: one(departments, { fields: [tasks.departmentId], references: [departments.id] }),
  // Subtasks — self-referencing FK, disambiguated by relationName.
  parentTask: one(tasks, { fields: [tasks.parentTaskId], references: [tasks.id], relationName: 'TaskParent' }),
  subtasks: many(tasks, { relationName: 'TaskParent' }),
  additionalAssigneeLinks: many(taskAdditionalAssignees),
  // TaskDependency has 2 separate FKs to Task, disambiguated by relationName.
  blockedByLinks: many(taskDependencies, { relationName: 'TaskDependent' }),
  blockingLinks: many(taskDependencies, { relationName: 'TaskBlocker' }),
  tagLinks: many(taskTags),
  attachments: many(taskAttachments),
  checklists: many(taskChecklists),
  comments: many(taskComments),
  statusUpdates: many(taskStatusUpdates),
  notifications: many(notifications),
  smartTaskConversations: many(smartTaskConversations),
}));

export const taskAdditionalAssigneesRelations = relations(taskAdditionalAssignees, ({ one }) => ({
  task: one(tasks, { fields: [taskAdditionalAssignees.taskId], references: [tasks.id] }),
  user: one(users, { fields: [taskAdditionalAssignees.userId], references: [users.id] }),
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, { fields: [taskDependencies.taskId], references: [tasks.id], relationName: 'TaskDependent' }),
  dependsOnTask: one(tasks, {
    fields: [taskDependencies.dependsOnTaskId],
    references: [tasks.id],
    relationName: 'TaskBlocker',
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  taskLinks: many(taskTags),
  ticketLinks: many(ticketTags),
}));

export const taskTagsRelations = relations(taskTags, ({ one }) => ({
  task: one(tasks, { fields: [taskTags.taskId], references: [tasks.id] }),
  tag: one(tags, { fields: [taskTags.tagId], references: [tags.id] }),
}));

export const taskAttachmentsRelations = relations(taskAttachments, ({ one }) => ({
  task: one(tasks, { fields: [taskAttachments.taskId], references: [tasks.id] }),
  uploadedByUser: one(users, { fields: [taskAttachments.uploadedBy], references: [users.id] }),
}));

export const taskChecklistsRelations = relations(taskChecklists, ({ one, many }) => ({
  task: one(tasks, { fields: [taskChecklists.taskId], references: [tasks.id] }),
  items: many(taskChecklistItems),
}));

export const taskChecklistItemsRelations = relations(taskChecklistItems, ({ one, many }) => ({
  taskChecklist: one(taskChecklists, { fields: [taskChecklistItems.taskChecklistId], references: [taskChecklists.id] }),
  assignee: one(users, { fields: [taskChecklistItems.assigneeId], references: [users.id] }),
  images: many(taskImages),
}));

export const taskImagesRelations = relations(taskImages, ({ one }) => ({
  taskChecklistItem: one(taskChecklistItems, {
    fields: [taskImages.taskChecklistItemId],
    references: [taskChecklistItems.id],
  }),
  uploadedByUser: one(users, { fields: [taskImages.uploadedBy], references: [users.id] }),
}));

export const taskStatusUpdatesRelations = relations(taskStatusUpdates, ({ one }) => ({
  task: one(tasks, { fields: [taskStatusUpdates.taskId], references: [tasks.id] }),
  changedByUser: one(users, { fields: [taskStatusUpdates.changedBy], references: [users.id] }),
}));

export const taskCommentsRelations = relations(taskComments, ({ one, many }) => ({
  task: one(tasks, { fields: [taskComments.taskId], references: [tasks.id] }),
  author: one(users, { fields: [taskComments.authorId], references: [users.id] }),
  attachments: many(taskCommentAttachments),
}));

export const taskCommentAttachmentsRelations = relations(taskCommentAttachments, ({ one }) => ({
  comment: one(taskComments, { fields: [taskCommentAttachments.commentId], references: [taskComments.id] }),
}));

export const todosRelations = relations(todos, ({ one }) => ({
  user: one(users, { fields: [todos.userId], references: [users.id] }),
}));

export const smartTaskConversationsRelations = relations(smartTaskConversations, ({ one, many }) => ({
  user: one(users, { fields: [smartTaskConversations.userId], references: [users.id] }),
  resultingTask: one(tasks, { fields: [smartTaskConversations.resultingTaskId], references: [tasks.id] }),
  messages: many(smartTaskConversationMessages),
}));

export const smartTaskConversationMessagesRelations = relations(smartTaskConversationMessages, ({ one }) => ({
  conversation: one(smartTaskConversations, {
    fields: [smartTaskConversationMessages.conversationId],
    references: [smartTaskConversations.id],
  }),
}));

export const pendingTaskConversationsRelations = relations(pendingTaskConversations, ({ one }) => ({
  user: one(users, {
    fields: [pendingTaskConversations.userId],
    references: [users.id],
    relationName: 'PendingConversationUser',
  }),
  draftAssignee: one(users, {
    fields: [pendingTaskConversations.draftAssigneeId],
    references: [users.id],
    relationName: 'PendingConversationDraftAssignee',
  }),
  draftDepartment: one(departments, {
    fields: [pendingTaskConversations.draftDepartmentId],
    references: [departments.id],
  }),
}));

// ===========================================================================
// ticket.ts relations
// ===========================================================================

export const ticketsRelations = relations(tickets, ({ one, many }) => ({
  raisedBy: one(users, { fields: [tickets.userId], references: [users.id], relationName: 'TicketRaiser' }),
  assignee: one(users, { fields: [tickets.assigneeId], references: [users.id], relationName: 'TicketAssignee' }),
  verifier: one(users, { fields: [tickets.verifiedBy], references: [users.id], relationName: 'TicketVerifier' }),
  store: one(stores, { fields: [tickets.storeId], references: [stores.id] }),
  category: one(categories, { fields: [tickets.categoryId], references: [categories.id] }),
  department: one(departments, { fields: [tickets.departmentId], references: [departments.id] }),
  attachments: many(ticketAttachments),
  comments: many(ticketComments),
  statusUpdates: many(ticketStatusUpdates),
  checklists: many(checklists),
  notifications: many(notifications),
  checklistInstanceIssues: many(checklistInstanceItems),
  tagLinks: many(ticketTags),
}));

export const ticketTagsRelations = relations(ticketTags, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketTags.ticketId], references: [tickets.id] }),
  tag: one(tags, { fields: [ticketTags.tagId], references: [tags.id] }),
}));

export const ticketStatusUpdatesRelations = relations(ticketStatusUpdates, ({ one, many }) => ({
  ticket: one(tickets, { fields: [ticketStatusUpdates.ticketId], references: [tickets.id] }),
  changedByUser: one(users, { fields: [ticketStatusUpdates.changedBy], references: [users.id] }),
  photos: many(ticketAttachments),
}));

export const ticketAttachmentsRelations = relations(ticketAttachments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketAttachments.ticketId], references: [tickets.id] }),
  statusUpdate: one(ticketStatusUpdates, {
    fields: [ticketAttachments.statusUpdateId],
    references: [ticketStatusUpdates.id],
  }),
  uploadedByUser: one(users, { fields: [ticketAttachments.uploadedBy], references: [users.id] }),
}));

export const ticketCommentsRelations = relations(ticketComments, ({ one }) => ({
  ticket: one(tickets, { fields: [ticketComments.ticketId], references: [tickets.id] }),
  author: one(users, { fields: [ticketComments.authorId], references: [users.id] }),
}));

export const checklistsRelations = relations(checklists, ({ one, many }) => ({
  ticket: one(tickets, { fields: [checklists.ticketId], references: [tickets.id] }),
  items: many(checklistItems),
}));

export const checklistItemsRelations = relations(checklistItems, ({ one, many }) => ({
  checklist: one(checklists, { fields: [checklistItems.checklistId], references: [checklists.id] }),
  assignee: one(users, { fields: [checklistItems.assigneeId], references: [users.id] }),
  images: many(checklistImages),
}));

export const checklistImagesRelations = relations(checklistImages, ({ one }) => ({
  checklistItem: one(checklistItems, { fields: [checklistImages.checklistItemId], references: [checklistItems.id] }),
  uploadedByUser: one(users, { fields: [checklistImages.uploadedBy], references: [users.id] }),
}));

export const checklistTemplatesRelations = relations(checklistTemplates, ({ one, many }) => ({
  department: one(departments, { fields: [checklistTemplates.departmentId], references: [departments.id] }),
  createdByUser: one(users, { fields: [checklistTemplates.createdBy], references: [users.id] }),
  items: many(checklistTemplateItems),
}));

export const checklistTemplateItemsRelations = relations(checklistTemplateItems, ({ one }) => ({
  template: one(checklistTemplates, { fields: [checklistTemplateItems.templateId], references: [checklistTemplates.id] }),
  defaultAssignee: one(users, { fields: [checklistTemplateItems.defaultAssigneeId], references: [users.id] }),
}));

// ===========================================================================
// checklistDefinition.ts relations
// ===========================================================================

export const checklistDefinitionsRelations = relations(checklistDefinitions, ({ one, many }) => ({
  createdByUser: one(users, { fields: [checklistDefinitions.createdBy], references: [users.id] }),
  storeLinks: many(checklistDefinitionStores),
  assigneeLinks: many(checklistDefinitionAssignees),
  items: many(checklistDefinitionItems),
  instances: many(checklistInstances),
}));

export const checklistDefinitionStoresRelations = relations(checklistDefinitionStores, ({ one }) => ({
  definition: one(checklistDefinitions, {
    fields: [checklistDefinitionStores.definitionId],
    references: [checklistDefinitions.id],
  }),
  store: one(stores, { fields: [checklistDefinitionStores.storeId], references: [stores.id] }),
}));

export const checklistDefinitionAssigneesRelations = relations(checklistDefinitionAssignees, ({ one }) => ({
  definition: one(checklistDefinitions, {
    fields: [checklistDefinitionAssignees.definitionId],
    references: [checklistDefinitions.id],
  }),
  user: one(users, { fields: [checklistDefinitionAssignees.userId], references: [users.id] }),
}));

export const checklistDefinitionItemsRelations = relations(checklistDefinitionItems, ({ one, many }) => ({
  definition: one(checklistDefinitions, {
    fields: [checklistDefinitionItems.definitionId],
    references: [checklistDefinitions.id],
  }),
  auditUserLinks: many(checklistDefinitionItemAuditUsers),
}));

export const checklistDefinitionItemAuditUsersRelations = relations(checklistDefinitionItemAuditUsers, ({ one }) => ({
  item: one(checklistDefinitionItems, {
    fields: [checklistDefinitionItemAuditUsers.itemId],
    references: [checklistDefinitionItems.id],
  }),
  user: one(users, { fields: [checklistDefinitionItemAuditUsers.userId], references: [users.id] }),
}));

// ===========================================================================
// checklistInstance.ts relations
// ===========================================================================

export const checklistInstancesRelations = relations(checklistInstances, ({ one, many }) => ({
  definition: one(checklistDefinitions, {
    fields: [checklistInstances.definitionId],
    references: [checklistDefinitions.id],
  }),
  store: one(stores, { fields: [checklistInstances.storeId], references: [stores.id] }),
  verifier: one(users, { fields: [checklistInstances.verifiedBy], references: [users.id] }),
  assigneeLinks: many(checklistInstanceAssignees),
  items: many(checklistInstanceItems),
  notifications: many(notifications),
}));

export const checklistInstanceAssigneesRelations = relations(checklistInstanceAssignees, ({ one }) => ({
  instance: one(checklistInstances, {
    fields: [checklistInstanceAssignees.instanceId],
    references: [checklistInstances.id],
  }),
  user: one(users, { fields: [checklistInstanceAssignees.userId], references: [users.id] }),
}));

export const checklistInstanceItemsRelations = relations(checklistInstanceItems, ({ one, many }) => ({
  instance: one(checklistInstances, {
    fields: [checklistInstanceItems.instanceId],
    references: [checklistInstances.id],
  }),
  completedByUser: one(users, { fields: [checklistInstanceItems.completedBy], references: [users.id] }),
  issueTicket: one(tickets, { fields: [checklistInstanceItems.issueId], references: [tickets.id] }),
  images: many(checklistInstanceImages),
  submissions: many(checklistInstanceItemSubmissions),
}));

export const checklistInstanceItemSubmissionsRelations = relations(
  checklistInstanceItemSubmissions,
  ({ one, many }) => ({
    item: one(checklistInstanceItems, {
      fields: [checklistInstanceItemSubmissions.itemId],
      references: [checklistInstanceItems.id],
    }),
    user: one(users, { fields: [checklistInstanceItemSubmissions.userId], references: [users.id] }),
    accessories: many(checklistInstanceItemSubmissionAccessories),
    images: many(checklistInstanceItemSubmissionImages),
  }),
);

export const checklistInstanceItemSubmissionAccessoriesRelations = relations(
  checklistInstanceItemSubmissionAccessories,
  ({ one }) => ({
    submission: one(checklistInstanceItemSubmissions, {
      fields: [checklistInstanceItemSubmissionAccessories.submissionId],
      references: [checklistInstanceItemSubmissions.id],
    }),
  }),
);

export const checklistInstanceImagesRelations = relations(checklistInstanceImages, ({ one }) => ({
  checklistInstanceItem: one(checklistInstanceItems, {
    fields: [checklistInstanceImages.checklistInstanceItemId],
    references: [checklistInstanceItems.id],
  }),
  uploadedByUser: one(users, { fields: [checklistInstanceImages.uploadedBy], references: [users.id] }),
}));

export const checklistInstanceItemSubmissionImagesRelations = relations(
  checklistInstanceItemSubmissionImages,
  ({ one }) => ({
    submission: one(checklistInstanceItemSubmissions, {
      fields: [checklistInstanceItemSubmissionImages.submissionId],
      references: [checklistInstanceItemSubmissions.id],
    }),
    uploadedByUser: one(users, { fields: [checklistInstanceItemSubmissionImages.uploadedBy], references: [users.id] }),
  }),
);

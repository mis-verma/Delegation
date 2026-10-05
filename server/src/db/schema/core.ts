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
} from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';

// ---------------------------------------------------------------------------
// Shared enum value arrays (exported for reuse in Zod validation etc.)
// ---------------------------------------------------------------------------

// APPROVAL_MANAGER — the final sign-off stage of the two-stage QC → final-approval workflow
// (see task.service.ts/ticket.service.ts/checklistInstance.service.ts's `assertCanApprove`).
// Org-wide reach, like ADMIN/PC, deliberately distinct from the existing QC reviewers
// (ADMIN/PC/MANAGER-in-department/named reviewer) — someone who already did QC on an item can't
// also be the one who gives it final approval.
export const ROLES = ['ADMIN', 'APPROVAL_MANAGER', 'SENIOR', 'MANAGER', 'AGENT', 'USER', 'PC'] as const;
// Only used to pick which uniform checklist an audit gives a person (an AUDIT question can carry a
// separate female and male list). Null = not set: that person gets the question's main list.
export const GENDERS = ['FEMALE', 'MALE'] as const;
export type Gender = (typeof GENDERS)[number];
export type Role = (typeof ROLES)[number];
export const EVENT_TYPES = ['DEADLINE', 'ANNOUNCEMENT', 'BROADCAST'] as const;

// SENIOR sits between ADMIN and MANAGER: a Senior/Area Head oversees one whole store (all
// departments in it), above a MANAGER/HOD who only heads a single department. Applied to a
// new user's `rank` column at insert time when not explicitly provided (see
// src/utils/password.ts#deriveDefaultRank) — mirrors the Mongoose pre('validate') hook.
// APPROVAL_MANAGER ranks just below ADMIN — org-wide final-approval authority, same tier as
// ADMIN/PC rather than a department-scoped role like SENIOR/MANAGER.
export const DEFAULT_RANK_BY_ROLE: Record<Role, number> = {
  ADMIN: 1,
  APPROVAL_MANAGER: 2,
  SENIOR: 3,
  MANAGER: 4,
  PC: 5,
  AGENT: 6,
  USER: 7,
};

// ---------------------------------------------------------------------------
// Store — physical retail location
// ---------------------------------------------------------------------------
export const stores = mysqlTable(
  'Store',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    code: varchar('code', { length: 191 }),
    address: varchar('address', { length: 500 }),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('Store_name_key').on(table.name)],
);

// ---------------------------------------------------------------------------
// Holiday — a company-wide day off (national holidays). On these dates the daily checklist
// generator creates no run, so nobody has anything to miss and no completion/compliance score
// drops. `date` is the org-local calendar day as 'YYYY-MM-DD' (a plain string on purpose: it is a
// calendar label, not a moment in time, so it can't drift with time zones).
// ---------------------------------------------------------------------------
export const holidays = mysqlTable(
  'Holiday',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    date: varchar('date', { length: 10 }).notNull(),
    name: varchar('name', { length: 191 }).notNull(),
    // Plain string, not a foreign key: the admin who added it may leave, and that must never block
    // deleting their user (same reasoning as AuditLog.actorId).
    createdBy: varchar('createdBy', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('Holiday_date_key').on(table.date)],
);

// ---------------------------------------------------------------------------
// DressType — a named way of dressing for work ("Saree", "Coat, pant and heels", "Formal shirt").
// Admin-defined, any number. An AUDIT question can carry a tick-list per type
// (ChecklistDefinitionItem.accessoriesByType, keyed by this id) and a person's User.dressTypeId
// picks which one they are checked against. `gender` only narrows the picker on the client
// (null = offered to anyone); the server stores whatever it is sent.
// ---------------------------------------------------------------------------
export const dressTypes = mysqlTable(
  'DressType',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 80 }).notNull(),
    gender: mysqlEnum('gender', GENDERS),
    isActive: boolean('isActive').notNull().default(true),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('DressType_name_key').on(table.name)],
);

// ---------------------------------------------------------------------------
// Department — org unit, optionally scoped to a "home" store
// ---------------------------------------------------------------------------
export const departments = mysqlTable(
  'Department',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    isActive: boolean('isActive').notNull().default(true),
    storeId: varchar('storeId', { length: 191 }).references(() => stores.id),
    // True for a department that works fine without a Manager or Senior (Admin or PC approve for it):
    // it is left out of the "departments without a head" warning on Org Structure.
    headOptional: boolean('headOptional').notNull().default(false),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('Department_name_key').on(table.name)],
);

// ---------------------------------------------------------------------------
// User — application account (agents, managers, admins, etc.)
// ---------------------------------------------------------------------------
export const users = mysqlTable(
  'User',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    email: varchar('email', { length: 191 }).notNull(),
    // bcrypt hash (~60 chars). NEVER select/return this column in API responses —
    // Drizzle has no Mongoose `select:false` equivalent; always list explicit
    // columns in `db.select({...})` for any user-facing read.
    passwordHash: varchar('passwordHash', { length: 191 }).notNull(),
    firstName: varchar('firstName', { length: 191 }).notNull(),
    lastName: varchar('lastName', { length: 191 }),
    role: mysqlEnum('role', ROLES).notNull().default('USER'),
    gender: mysqlEnum('gender', GENDERS),
    // What this person wears to work (Admin > Dress types). Decides which tick-list an audit gives
    // them; null = fall back to the gender list. Set to null if the type is deleted.
    dressTypeId: varchar('dressTypeId', { length: 191 }).references(() => dressTypes.id, { onDelete: 'set null' }),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    storeId: varchar('storeId', { length: 191 }).references(() => stores.id),
    isActive: boolean('isActive').notNull().default(true),
    // Derived from `role` via DEFAULT_RANK_BY_ROLE when null; app-layer sets this
    // on insert if not provided (min 1, max 6 — not enforced at the DB level).
    rank: int('rank'),
    phone: varchar('phone', { length: 191 }),
    // Relative path under /uploads, same convention as TaskImage.url (task.ts) — e.g.
    // "/uploads/avatars/<hex>.jpg". Null until the user (or an admin) uploads one; the client
    // falls back to an initials avatar.
    avatarUrl: varchar('avatarUrl', { length: 2048 }),
    // Set on every socket connect/disconnect (see modules/presence/presence.service.ts) — "when
    // were they last seen", independent of the Redis-backed "are they online right now" set,
    // which never persists and self-heals but can't answer "how long ago" once someone's gone.
    lastActiveAt: datetime('lastActiveAt', { mode: 'date' }),
    // Weekly day(s) off, 0 = Sunday … 6 = Saturday. On those days the daily checklist generator
    // leaves this person off that day's run (and skips the run if nobody's left). Null = none.
    weekOffDays: json('weekOffDays').$type<number[]>(),
    // Set on every password change/reset. authenticate() rejects an access token issued before it,
    // so a password change also kills any still-live access token, not just the refresh sessions.
    passwordChangedAt: datetime('passwordChangedAt', { mode: 'date' }),
    // True after an admin created the account or set/reset the password: the person must choose their
    // own before using the app, so nobody but them ever knows their real password.
    mustChangePassword: boolean('mustChangePassword').notNull().default(false),
    // Set when isActive goes false (PATCH or offboard), cleared on reactivation.
    deactivatedAt: datetime('deactivatedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('User_role_isActive_idx').on(table.role, table.isActive),
    uniqueIndex('User_email_key').on(table.email),
    // Mongoose had `unique: true, sparse: true`; MySQL unique indexes already
    // allow multiple NULLs, so a plain unique index reproduces "sparse" semantics.
    uniqueIndex('User_phone_key').on(table.phone),
  ],
);

// ---------------------------------------------------------------------------
// RefreshToken — long-lived auth refresh tokens
// ---------------------------------------------------------------------------
export const refreshTokens = mysqlTable(
  'RefreshToken',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    tokenHash: varchar('tokenHash', { length: 191 }).notNull(),
    expiresAt: datetime('expiresAt', { mode: 'date' }).notNull(),
    revokedAt: datetime('revokedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('RefreshToken_userId_idx').on(table.userId),
    uniqueIndex('RefreshToken_tokenHash_key').on(table.tokenHash),
  ],
);

// ---------------------------------------------------------------------------
// PasswordResetToken — one-time password reset tokens
// ---------------------------------------------------------------------------
export const passwordResetTokens = mysqlTable(
  'PasswordResetToken',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    tokenHash: varchar('tokenHash', { length: 191 }).notNull(),
    expiresAt: datetime('expiresAt', { mode: 'date' }).notNull(),
    usedAt: datetime('usedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('PasswordResetToken_userId_idx').on(table.userId),
    uniqueIndex('PasswordResetToken_tokenHash_key').on(table.tokenHash),
  ],
);

// ---------------------------------------------------------------------------
// Category — task/ticket category scoped to a department
// ---------------------------------------------------------------------------
export const categories = mysqlTable(
  'Category',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    isActive: boolean('isActive').notNull().default(true),
    departmentId: varchar('departmentId', { length: 191 }).notNull().references(() => departments.id),
    tatHours: float('tatHours'),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('Category_name_key').on(table.name)],
);

// Category.assigneeIds — many-to-many junction (Category <-> User)
export const categoryAssignees = mysqlTable(
  'CategoryAssignee',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    categoryId: varchar('categoryId', { length: 191 }).notNull().references(() => categories.id, { onDelete: 'cascade' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('CategoryAssignee_categoryId_userId_key').on(table.categoryId, table.userId)],
);

// ---------------------------------------------------------------------------
// Event — announcement / deadline / broadcast calendar entry
// ---------------------------------------------------------------------------
export const events = mysqlTable('Event', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  title: varchar('title', { length: 191 }).notNull(),
  description: text('description'),
  type: mysqlEnum('type', EVENT_TYPES).notNull().default('ANNOUNCEMENT'),
  eventDate: datetime('eventDate', { mode: 'date' }).notNull(),
  createdBy: varchar('createdBy', { length: 191 }).notNull().references(() => users.id),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Settings — single-row-style global config document
// ---------------------------------------------------------------------------
export const settings = mysqlTable('Settings', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  defaultTatHours: float('defaultTatHours').notNull().default(24),
  maxUploadSizeMb: float('maxUploadSizeMb').notNull().default(5),
  // Fixed typo from Mongoose source (`maxUploadFiltes`) — client/validation code
  // already used the correct spelling, so the old field name was silently broken.
  maxUploadFiles: int('maxUploadFiles').notNull().default(10),
  allowedImageTypes: json('allowedImageTypes').$type<string[]>().notNull().default(['image/jpeg', 'image/png', 'image/webp']),
  // Runtime counterpart to the client's build-time VITE_MAINTENANCE_MODE (see client's
  // lib/maintenance.ts) — that env var still hard-kills the app for a deploy; this is the
  // admin-toggleable version for planned downtime that doesn't need a redeploy to flip.
  maintenanceMode: boolean('maintenanceMode').notNull().default(false),
  maintenanceMessage: varchar('maintenanceMessage', { length: 500 }),
  // Org-wide kill switches for the two reminder cron jobs (see jobs/taskDeadlineReminder.job.ts
  // and jobs/checklistOverdueNotifier.job.ts) — neither had an off-switch before this. Per-user
  // notification muting doesn't exist in this app; these are the coarser "does this reminder fire
  // at all" defaults instead.
  notifyTaskDeadlineReminders: boolean('notifyTaskDeadlineReminders').notNull().default(true),
  notifyChecklistOverdueReminders: boolean('notifyChecklistOverdueReminders').notNull().default(true),
  // Replaces the old JWT_ACCESS_EXPIRES_IN/JWT_REFRESH_EXPIRES_IN_DAYS env vars — read live by
  // auth.service.ts/auth.controller.ts on every token issuance, so an admin can tighten or relax
  // session length without a redeploy. Not retroactive: only affects tokens issued after the
  // change (new logins, or the next refresh-rotation for an already-signed-in session).
  accessTokenExpiresMinutes: int('accessTokenExpiresMinutes').notNull().default(15),
  refreshTokenExpiresDays: int('refreshTokenExpiresDays').notNull().default(30),
  // Org name/logo shown in the header, footer and login screen (see client's lib/maintenance.ts —
  // usePublicSettingsQuery) and used as the email "from" display name and password-reset copy in
  // place of the old hardcoded "Task Matrix" strings. logoUrl is null until an admin uploads one —
  // every renderer falls back to the bundled default logo.png in that case, same as avatarUrl
  // falling back to initials.
  orgName: varchar('orgName', { length: 191 }).notNull().default('Karya'),
  logoUrl: varchar('logoUrl', { length: 500 }),
  // Replaces AUDIT_RETENTION_DAYS/NOTIFICATION_RETENTION_DAYS/INBOUND_MESSAGE_RETENTION_DAYS env
  // vars — read live by the matching jobs/*Retention.job.ts nightly sweeps. 0 keeps everything
  // forever (same semantics the env vars had), for anyone with a "retain indefinitely" compliance
  // requirement.
  auditRetentionDays: int('auditRetentionDays').notNull().default(365),
  notificationRetentionDays: int('notificationRetentionDays').notNull().default(90),
  inboundMessageRetentionDays: int('inboundMessageRetentionDays').notNull().default(7),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// AuditLog — generic change-history log, polymorphic target
// ---------------------------------------------------------------------------
export const auditLogs = mysqlTable(
  'AuditLog',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    // Polymorphic reference: entityType + entityId together identify a row in an
    // arbitrary other table. No FK enforcement is possible for this in MySQL.
    entityType: varchar('entityType', { length: 191 }).notNull(),
    entityId: varchar('entityId', { length: 191 }).notNull(),
    action: varchar('action', { length: 191 }).notNull(),
    // Intentionally NOT a FK to users — stored as a plain string per source comment
    // (actor identity here can't be joined to Users directly, e.g. system actors).
    actorId: varchar('actorId', { length: 191 }).notNull(),
    before: json('before').$type<unknown>(),
    after: json('after').$type<unknown>(),
    // Who did it, written down at the time: the name still reads correctly after the account is
    // renamed, deactivated or deleted. Null on rows from before this column existed.
    actorName: varchar('actorName', { length: 191 }),
    // Where the change came from: 'APP' (a person using the app), 'SYSTEM' (a background job or
    // other non-user actor), 'WHATSAPP'. Null on older rows.
    source: varchar('source', { length: 32 }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('AuditLog_entityType_entityId_idx').on(table.entityType, table.entityId),
    // The Audit Log page sorts by date and filters by person / action / section; without these each
    // of those is a full scan of a table that only ever grows.
    index('AuditLog_createdAt_idx').on(table.createdAt),
    index('AuditLog_actorId_createdAt_idx').on(table.actorId, table.createdAt),
    index('AuditLog_action_createdAt_idx').on(table.action, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// JobRun: heartbeat of each background job (see utils/jobTracker.ts), one row per job name
// ---------------------------------------------------------------------------
export const jobRuns = mysqlTable('JobRun', {
  name: varchar('name', { length: 100 }).primaryKey(),
  schedule: varchar('schedule', { length: 64 }).notNull(),
  // How often it should run: the health page calls a job late once it is well past this.
  expectedEveryMinutes: int('expectedEveryMinutes').notNull(),
  lastStartedAt: datetime('lastStartedAt', { mode: 'date' }).notNull(),
  lastFinishedAt: datetime('lastFinishedAt', { mode: 'date' }).notNull(),
  lastDurationMs: int('lastDurationMs').notNull().default(0),
  lastStatus: mysqlEnum('lastStatus', ['OK', 'FAILED']).notNull(),
  lastError: text('lastError'),
  runCount: int('runCount').notNull().default(0),
  failCount: int('failCount').notNull().default(0),
  lastFailedAt: datetime('lastFailedAt', { mode: 'date' }),
});

// ---------------------------------------------------------------------------
// Project — lightweight grouping of tasks with an owner and members
// ---------------------------------------------------------------------------
export const projects = mysqlTable('Project', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  name: varchar('name', { length: 191 }).notNull(),
  description: text('description').notNull().default(''),
  ownerId: varchar('ownerId', { length: 191 }).notNull().references(() => users.id),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

// Project.memberIds — many-to-many junction (Project <-> User)
export const projectMembers = mysqlTable(
  'ProjectMember',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    projectId: varchar('projectId', { length: 191 }).notNull().references(() => projects.id, { onDelete: 'cascade' }),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('ProjectMember_projectId_userId_key').on(table.projectId, table.userId)],
);

// ---------------------------------------------------------------------------
// Notification — in-app notification, "polymorphic-lite" via 3 nullable FKs
// ---------------------------------------------------------------------------
export const notifications = mysqlTable(
  'Notification',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    recipientId: varchar('recipientId', { length: 191 }).notNull().references(() => users.id),
    type: varchar('type', { length: 191 }).notNull(),
    title: varchar('title', { length: 191 }).notNull(),
    message: text('message').notNull(),
    // Exactly one of ticketId / taskId / checklistInstanceId is expected to be
    // non-null (app-enforced invariant, not a DB constraint). These reference
    // tables defined in ticket.ts / task.ts / checklistInstance.ts; declared as
    // plain varchar (no `.references()`) here to avoid a circular file import,
    // since those files already import from core.ts.
    ticketId: varchar('ticketId', { length: 191 }), // FK to Ticket.id, no .references() to avoid a circular import
    taskId: varchar('taskId', { length: 191 }), // FK to Task.id, no .references() to avoid a circular import
    checklistInstanceId: varchar('checklistInstanceId', { length: 191 }), // FK to ChecklistInstance.id, no .references() to avoid a circular import
    isRead: boolean('isRead').notNull().default(false),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('Notification_recipientId_idx').on(table.recipientId)],
);

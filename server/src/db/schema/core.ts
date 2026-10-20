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
  type AnyMySqlColumn,
} from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';

export const ROLES = ['ADMIN', 'APPROVAL_MANAGER', 'SENIOR', 'MANAGER', 'AGENT', 'USER', 'PC'] as const;
export const GENDERS = ['FEMALE', 'MALE'] as const;
export type Gender = (typeof GENDERS)[number];
export type Role = (typeof ROLES)[number];
export const EVENT_TYPES = ['DEADLINE', 'ANNOUNCEMENT', 'BROADCAST'] as const;

export const DEFAULT_RANK_BY_ROLE: Record<Role, number> = {
  ADMIN: 1,
  APPROVAL_MANAGER: 2,
  SENIOR: 3,
  MANAGER: 4,
  PC: 5,
  AGENT: 6,
  USER: 7,
};

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

export const holidays = mysqlTable(
  'Holiday',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    date: varchar('date', { length: 10 }).notNull(),
    name: varchar('name', { length: 191 }).notNull(),
    createdBy: varchar('createdBy', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('Holiday_date_key').on(table.date)],
);

export const EXTRA_WORKING_DAY_SCOPES = ['ALL', 'DEPARTMENT', 'STORE', 'PEOPLE'] as const;

export const extraWorkingDays = mysqlTable(
  'ExtraWorkingDay',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    date: varchar('date', { length: 10 }).notNull(),
    reason: varchar('reason', { length: 191 }).notNull(),
    scope: mysqlEnum('scope', EXTRA_WORKING_DAY_SCOPES).notNull().default('ALL'),
    targetIds: json('targetIds').$type<string[]>().notNull(),
    createdBy: varchar('createdBy', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('ExtraWorkingDay_date_idx').on(table.date)],
);

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

export const departments = mysqlTable(
  'Department',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    name: varchar('name', { length: 191 }).notNull(),
    isActive: boolean('isActive').notNull().default(true),
    storeId: varchar('storeId', { length: 191 }).references(() => stores.id),
    headOptional: boolean('headOptional').notNull().default(false),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('Department_name_key').on(table.name)],
);

export const users = mysqlTable(
  'User',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    email: varchar('email', { length: 191 }).notNull(),
    passwordHash: varchar('passwordHash', { length: 191 }).notNull(),
    firstName: varchar('firstName', { length: 191 }).notNull(),
    lastName: varchar('lastName', { length: 191 }),
    role: mysqlEnum('role', ROLES).notNull().default('USER'),
    gender: mysqlEnum('gender', GENDERS),
    dressTypeId: varchar('dressTypeId', { length: 191 }).references(() => dressTypes.id, { onDelete: 'set null' }),
    departmentId: varchar('departmentId', { length: 191 }).references(() => departments.id),
    storeId: varchar('storeId', { length: 191 }).references(() => stores.id),
    reportsToId: varchar('reportsToId', { length: 191 }).references((): AnyMySqlColumn => users.id, { onDelete: 'set null' }),
    isActive: boolean('isActive').notNull().default(true),
    rank: int('rank'),
    phone: varchar('phone', { length: 191 }),
    avatarUrl: varchar('avatarUrl', { length: 2048 }),
    lastActiveAt: datetime('lastActiveAt', { mode: 'date' }),
    weekOffDays: json('weekOffDays').$type<number[]>(),
    passwordChangedAt: datetime('passwordChangedAt', { mode: 'date' }),
    mustChangePassword: boolean('mustChangePassword').notNull().default(false),
    deactivatedAt: datetime('deactivatedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('User_role_isActive_idx').on(table.role, table.isActive),
    uniqueIndex('User_email_key').on(table.email),
    uniqueIndex('User_phone_key').on(table.phone),
  ],
);

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

export const settings = mysqlTable('Settings', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  defaultTatHours: float('defaultTatHours').notNull().default(24),
  maxUploadSizeMb: float('maxUploadSizeMb').notNull().default(5),
  maxUploadFiles: int('maxUploadFiles').notNull().default(10),
  allowedImageTypes: json('allowedImageTypes').$type<string[]>().notNull().default(['image/jpeg', 'image/png', 'image/webp']),
  maintenanceMode: boolean('maintenanceMode').notNull().default(false),
  maintenanceMessage: varchar('maintenanceMessage', { length: 500 }),
  notifyTaskDeadlineReminders: boolean('notifyTaskDeadlineReminders').notNull().default(true),
  notifyChecklistOverdueReminders: boolean('notifyChecklistOverdueReminders').notNull().default(true),
  accessTokenExpiresMinutes: int('accessTokenExpiresMinutes').notNull().default(15),
  refreshTokenExpiresDays: int('refreshTokenExpiresDays').notNull().default(30),
  orgName: varchar('orgName', { length: 191 }).notNull().default('Karya'),
  logoUrl: varchar('logoUrl', { length: 500 }),
  androidAppUrl: varchar('androidAppUrl', { length: 500 }),
  iosAppUrl: varchar('iosAppUrl', { length: 500 }),
  auditRetentionDays: int('auditRetentionDays').notNull().default(365),
  notificationRetentionDays: int('notificationRetentionDays').notNull().default(90),
  inboundMessageRetentionDays: int('inboundMessageRetentionDays').notNull().default(7),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

export const auditLogs = mysqlTable(
  'AuditLog',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    entityType: varchar('entityType', { length: 191 }).notNull(),
    entityId: varchar('entityId', { length: 191 }).notNull(),
    action: varchar('action', { length: 191 }).notNull(),
    actorId: varchar('actorId', { length: 191 }).notNull(),
    before: json('before').$type<unknown>(),
    after: json('after').$type<unknown>(),
    actorName: varchar('actorName', { length: 191 }),
    source: varchar('source', { length: 32 }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('AuditLog_entityType_entityId_idx').on(table.entityType, table.entityId),
    index('AuditLog_createdAt_idx').on(table.createdAt),
    index('AuditLog_actorId_createdAt_idx').on(table.actorId, table.createdAt),
    index('AuditLog_action_createdAt_idx').on(table.action, table.createdAt),
  ],
);

export const OVERDUE_SNAPSHOT_KINDS = ['TICKETS', 'DELEGATIONS'] as const;

export const overdueSnapshots = mysqlTable(
  'OverdueSnapshot',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    day: varchar('day', { length: 10 }).notNull(),
    kind: mysqlEnum('kind', OVERDUE_SNAPSHOT_KINDS).notNull(),
    count: int('count').notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex('OverdueSnapshot_day_kind_key').on(table.day, table.kind)],
);

export const jobRuns = mysqlTable('JobRun', {
  name: varchar('name', { length: 100 }).primaryKey(),
  schedule: varchar('schedule', { length: 64 }).notNull(),
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

export const projects = mysqlTable('Project', {
  id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
  name: varchar('name', { length: 191 }).notNull(),
  description: text('description').notNull().default(''),
  ownerId: varchar('ownerId', { length: 191 }).notNull().references(() => users.id),
  createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

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

export const notifications = mysqlTable(
  'Notification',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    recipientId: varchar('recipientId', { length: 191 }).notNull().references(() => users.id),
    type: varchar('type', { length: 191 }).notNull(),
    title: varchar('title', { length: 191 }).notNull(),
    message: text('message').notNull(),
    ticketId: varchar('ticketId', { length: 191 }),
    taskId: varchar('taskId', { length: 191 }),
    checklistInstanceId: varchar('checklistInstanceId', { length: 191 }),
    isRead: boolean('isRead').notNull().default(false),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('Notification_recipientId_idx').on(table.recipientId)],
);

export const DRAFT_KINDS = ['TICKET', 'CHECKLIST'] as const;

export const drafts = mysqlTable(
  'Draft',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    kind: mysqlEnum('kind', DRAFT_KINDS).notNull(),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 191 }).notNull(),
    payload: json('payload').$type<Record<string, unknown>>().notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('Draft_userId_kind_updatedAt_idx').on(table.userId, table.kind, table.updatedAt)],
);

export const PASSWORD_OTP_PURPOSES = ['SETUP', 'RESET'] as const;

export const passwordOtps = mysqlTable(
  'PasswordOtp',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    purpose: mysqlEnum('purpose', PASSWORD_OTP_PURPOSES).notNull(),
    codeHash: varchar('codeHash', { length: 191 }).notNull(),
    attempts: int('attempts').notNull().default(0),
    expiresAt: datetime('expiresAt', { mode: 'date' }).notNull(),
    usedAt: datetime('usedAt', { mode: 'date' }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index('PasswordOtp_userId_createdAt_idx').on(table.userId, table.createdAt)],
);

export const pushSubscriptions = mysqlTable(
  'PushSubscription',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    userId: varchar('userId', { length: 191 }).notNull().references(() => users.id, { onDelete: 'cascade' }),
    endpointHash: varchar('endpointHash', { length: 64 }).notNull(),
    endpoint: text('endpoint').notNull(),
    p256dh: varchar('p256dh', { length: 255 }).notNull(),
    auth: varchar('auth', { length: 255 }).notNull(),
    userAgent: varchar('userAgent', { length: 255 }),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
    lastUsedAt: datetime('lastUsedAt', { mode: 'date' }),
  },
  (table) => [
    uniqueIndex('PushSubscription_endpointHash_key').on(table.endpointHash),
    index('PushSubscription_userId_idx').on(table.userId),
  ],
);

export const notificationPreferences = mysqlTable('NotificationPreference', {
  userId: varchar('userId', { length: 191 }).primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  quietStart: varchar('quietStart', { length: 5 }),
  quietEnd: varchar('quietEnd', { length: 5 }),
  morningDigest: boolean('morningDigest').notNull().default(false),
  lastDigestOn: varchar('lastDigestOn', { length: 10 }),
  updatedAt: datetime('updatedAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
});

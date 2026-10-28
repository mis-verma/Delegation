import { mysqlTable, varchar, datetime, index } from 'drizzle-orm/mysql-core';
import { createId } from '@paralleldrive/cuid2';
import { users } from './core.js';

export const approvalCovers = mysqlTable(
  'ApprovalCover',
  {
    id: varchar('id', { length: 191 }).primaryKey().$defaultFn(() => createId()),
    fromUserId: varchar('fromUserId', { length: 191 }).notNull().references(() => users.id),
    toUserId: varchar('toUserId', { length: 191 }).notNull().references(() => users.id),
    startsAt: datetime('startsAt', { mode: 'date' }).notNull(),
    endsAt: datetime('endsAt', { mode: 'date' }).notNull(),
    note: varchar('note', { length: 191 }),
    revokedAt: datetime('revokedAt', { mode: 'date' }),
    createdBy: varchar('createdBy', { length: 191 }).notNull(),
    createdAt: datetime('createdAt', { mode: 'date' }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [
    index('ApprovalCover_toUserId_endsAt_idx').on(table.toUserId, table.endsAt),
    index('ApprovalCover_fromUserId_idx').on(table.fromUserId),
  ],
);

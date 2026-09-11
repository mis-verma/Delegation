import cron from 'node-cron';
import { lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { notifications } from '../db/schema/core.js';
import { env } from '../config/env.js';

// Same batching rationale as auditRetention.job.ts: an unbounded DELETE over a table that's been
// accumulating for months takes a long row lock, stalling every notification write behind it.
const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 50;

/**
 * Trims the Notification table to `NOTIFICATION_RETENTION_DAYS`.
 *
 * Written on every assignment/verification/reminder event across tickets, tasks and checklists,
 * with nothing ever removing them — same unbounded-growth shape AuditLog had before its own
 * retention sweep. Read state doesn't matter here: an old read notification is just as much
 * dead weight in the table as an old unread one.
 *
 * Set `NOTIFICATION_RETENTION_DAYS=0` to keep everything forever — the job then does nothing.
 */
export const startNotificationRetention = () => {
    // 03:30 daily — same quiet window as auditRetention (03:15) and ahead of the checklist
    // generator's morning run, offset 15 minutes so the two sweeps don't overlap.
    cron.schedule('30 3 * * *', async () => {
        const days = env.NOTIFICATION_RETENTION_DAYS;
        if (days <= 0) return;

        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        let removed = 0;

        try {
            for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
                const stale = await db
                    .select({ id: notifications.id })
                    .from(notifications)
                    .where(lt(notifications.createdAt, cutoff))
                    .limit(BATCH_SIZE);

                if (!stale.length) break;

                await db.delete(notifications).where(lt(notifications.createdAt, cutoff)).limit(BATCH_SIZE);
                removed += stale.length;

                if (stale.length < BATCH_SIZE) break;
            }

            if (removed > 0) {
                console.log(`Notification retention: removed ${removed} rows older than ${days} days`);
            }
        } catch (err) {
            // Same posture as auditRetention.job.ts: housekeeping must never take the server down.
            console.error('Notification retention sweep failed', err);
        }
    });
};

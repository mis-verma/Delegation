import cron from 'node-cron';
import { and, lt, notLike } from 'drizzle-orm';
import { db } from '../config/db.js';
import { auditLogs } from '../db/schema/core.js';
import { settingsService } from '../modules/settings/settings.service.js';

// Deleted in batches rather than one big statement. An unbounded `DELETE` over a table that has
// been accumulating for a year takes a long row lock, and on MySQL that stalls every write to
// AuditLog behind it — including the audit write of whatever request is in flight right now.
const BATCH_SIZE = 1000;
// Enough passes to clear a large first run, bounded so a mistake (e.g. a retention of 0 days)
// can't spin the job forever. Whatever's left is picked up by the next night's run.
const MAX_BATCHES_PER_RUN = 50;

/**
 * Trims the audit log to Settings.auditRetentionDays (admin-configurable, Admin → Settings).
 *
 * Audit rows are written on every create/update/delete across a dozen entities and nothing ever
 * removed them, so the table only ever grew. This is the counterpart to that coverage: the log
 * stays useful for the window people actually investigate, without becoming the largest table in
 * the database.
 *
 * A retention of 0 days keeps everything forever — the job then does nothing at all, which is the
 * right setting for anyone with a compliance requirement to retain indefinitely.
 */
export const startAuditRetention = () => {
    // 03:15 daily — off the hour so it doesn't pile onto every other job that picked midnight,
    // and in the quiet window before the checklist generator's morning run.
    cron.schedule('15 3 * * *', async () => {
        const days = settingsService.getCached().auditRetentionDays;
        if (days <= 0) return;

        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        let removed = 0;

        try {
            for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
                // Checklist-run history (answer changes, evidence removals, approvals) is the
                // compliance record for past days — it's never trimmed.
                const where = and(lt(auditLogs.createdAt, cutoff), notLike(auditLogs.entityType, 'ChecklistInstance%'));
                const stale = await db
                    .select({ id: auditLogs.id })
                    .from(auditLogs)
                    .where(where)
                    .limit(BATCH_SIZE);

                if (!stale.length) break;

                // Delete by the same condition rather than by the ids just read: identical result,
                // one fewer round trip, and no risk of a huge IN (...) list.
                await db.delete(auditLogs).where(where).limit(BATCH_SIZE);
                removed += stale.length;

                if (stale.length < BATCH_SIZE) break;
            }

            if (removed > 0) {
                console.log(`Audit retention: removed ${removed} log rows older than ${days} days`);
            }
        } catch (err) {
            // Same posture as auditService.record: housekeeping must never take the server down.
            console.error('Audit retention sweep failed', err);
        }
    });
};

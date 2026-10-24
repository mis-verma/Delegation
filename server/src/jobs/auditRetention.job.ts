import { scheduleJob } from '../utils/jobTracker.js';
import { and, like, lt, notLike, type SQL } from 'drizzle-orm';
import { db } from '../config/db.js';
import { auditLogs } from '../db/schema/core.js';
import { settingsService } from '../modules/settings/settings.service.js';

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

const sweepAuditRows = async (where: SQL | undefined): Promise<number> => {
    let removed = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
        const stale = await db.select({ id: auditLogs.id }).from(auditLogs).where(where).limit(BATCH_SIZE);
        if (!stale.length) break;
        await db.delete(auditLogs).where(where).limit(BATCH_SIZE);
        removed += stale.length;
        if (stale.length < BATCH_SIZE) break;
    }
    return removed;
};

export const startAuditRetention = () => {
    scheduleJob("audit-retention", '15 3 * * *', 1440, async () => {
        const { auditRetentionDays, checklistAuditRetentionDays } = settingsService.getCached();

        if (auditRetentionDays > 0) {
            const cutoff = new Date(Date.now() - auditRetentionDays * DAY_MS);
            const removed = await sweepAuditRows(and(lt(auditLogs.createdAt, cutoff), notLike(auditLogs.entityType, 'ChecklistInstance%')));
            if (removed > 0) console.log(`Audit retention: removed ${removed} log rows older than ${auditRetentionDays} days`);
        }

        if (checklistAuditRetentionDays > 0) {
            const cutoff = new Date(Date.now() - checklistAuditRetentionDays * DAY_MS);
            const removed = await sweepAuditRows(and(lt(auditLogs.createdAt, cutoff), like(auditLogs.entityType, 'ChecklistInstance%')));
            if (removed > 0) console.log(`Audit retention: removed ${removed} checklist log rows older than ${checklistAuditRetentionDays} days`);
        }
    });
};

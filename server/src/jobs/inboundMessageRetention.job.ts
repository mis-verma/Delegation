import cron from 'node-cron';
import { lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { processedInboundMessages } from '../db/schema/index.js';
import { settingsService } from '../modules/settings/settings.service.js';

// Same batching rationale as auditRetention.job.ts.
const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 50;

/**
 * Trims ProcessedInboundMessage to Settings.inboundMessageRetentionDays (admin-configurable,
 * Admin → Settings).
 *
 * Every claimed WhatsApp/DoubleTick webhook message id lives here forever otherwise — the same
 * unbounded-growth shape as AuditLog/Notification before their own retention sweeps, except this
 * one only needs to outlast the provider's actual retry window (hours), not weeks.
 */
export const startInboundMessageRetention = () => {
    // 03:45 daily — after auditRetention (03:15) and notificationRetention (03:30), same quiet
    // window, staggered so the three sweeps don't overlap.
    cron.schedule('45 3 * * *', async () => {
        const days = settingsService.getCached().inboundMessageRetentionDays;
        if (days <= 0) return;

        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        let removed = 0;

        try {
            for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
                const stale = await db
                    .select({ id: processedInboundMessages.id })
                    .from(processedInboundMessages)
                    .where(lt(processedInboundMessages.createdAt, cutoff))
                    .limit(BATCH_SIZE);

                if (!stale.length) break;

                await db.delete(processedInboundMessages).where(lt(processedInboundMessages.createdAt, cutoff)).limit(BATCH_SIZE);
                removed += stale.length;

                if (stale.length < BATCH_SIZE) break;
            }

            if (removed > 0) {
                console.log(`Inbound message retention: removed ${removed} rows older than ${days} days`);
            }
        } catch (err) {
            console.error('Inbound message retention sweep failed', err);
        }
    });
};

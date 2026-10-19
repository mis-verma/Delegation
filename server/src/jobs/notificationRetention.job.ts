import { scheduleJob } from '../utils/jobTracker.js';
import { lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { notifications } from '../db/schema/core.js';
import { settingsService } from '../modules/settings/settings.service.js';

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 50;

export const startNotificationRetention = () => {
    scheduleJob("notification-retention", '30 3 * * *', 1440, async () => {
        const days = settingsService.getCached().notificationRetentionDays;
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
            console.error('Notification retention sweep failed', err);
        }
    });
};

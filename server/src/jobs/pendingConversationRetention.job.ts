import { scheduleJob } from '../utils/jobTracker.js';
import { lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { pendingTaskConversations } from '../db/schema/index.js';

export const startPendingConversationRetention = () => {
    scheduleJob("pending-conversation-retention", '*/10 * * * *', 10, async () => {
        const now = new Date();
        let removed = 0;

        try {
            const [result] = await db.delete(pendingTaskConversations).where(lt(pendingTaskConversations.expiresAt, now));
            removed = result.affectedRows;

            if (removed > 0) {
                console.log(`Pending conversation retention: removed ${removed} expired row(s)`);
            }
        } catch (err) {
            console.error('Pending conversation retention sweep failed', err);
        }
    });
};

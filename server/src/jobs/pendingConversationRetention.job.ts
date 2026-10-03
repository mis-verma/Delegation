import { scheduleJob } from '../utils/jobTracker.js';
import { lt } from 'drizzle-orm';
import { db } from '../config/db.js';
import { pendingTaskConversations } from '../db/schema/index.js';

// Same batching rationale as auditRetention.job.ts, though this table stays naturally small: one
// row per phone, only while a WhatsApp/DoubleTick slot-filling conversation is actually in
// progress. Completing (advanceConversation's "done" branch) or cancelling a conversation already
// deletes its row immediately — the only rows this sweep ever finds are ones a user started and
// then simply never replied to again, left sitting past their own `expiresAt` (30 min TTL) with
// nothing to trigger the lazy expiry check in findActiveConversation, since that only runs when
// the same phone messages back in.
export const startPendingConversationRetention = () => {
    // Every 10 minutes — these are already-expired, small-in-number rows with a 30-minute TTL, so
    // this runs far more often than the once-daily audit/notification/inbound-message sweeps
    // (which trim much larger, slower-growing tables) rather than leaving abandoned conversations
    // to linger for up to a day.
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
            // Same posture as the other retention jobs: housekeeping must never take the server down.
            console.error('Pending conversation retention sweep failed', err);
        }
    });
};

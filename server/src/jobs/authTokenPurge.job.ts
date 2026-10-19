import { scheduleJob } from '../utils/jobTracker.js';
import { and, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '../config/db.js';
import { refreshTokens, passwordResetTokens } from '../db/schema/core.js';

const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 50;
const REVOKED_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export const startAuthTokenPurge = () => {
    scheduleJob('auth-token-purge', '20 3 * * *', 1440, async () => {
        const now = new Date();
        const revokedBefore = new Date(now.getTime() - REVOKED_KEEP_MS);
        let removed = 0;

        const refreshWhere = or(lt(refreshTokens.expiresAt, now), and(isNotNull(refreshTokens.revokedAt), lt(refreshTokens.revokedAt, revokedBefore)));
        for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
            const [result] = await db.delete(refreshTokens).where(refreshWhere).limit(BATCH_SIZE);
            const affected = result.affectedRows;
            removed += affected;
            if (affected < BATCH_SIZE) break;
        }

        const resetWhere = or(isNotNull(passwordResetTokens.usedAt), lt(passwordResetTokens.expiresAt, now));
        for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
            const [result] = await db.delete(passwordResetTokens).where(resetWhere).limit(BATCH_SIZE);
            const affected = result.affectedRows;
            removed += affected;
            if (affected < BATCH_SIZE) break;
        }

        if (removed > 0) console.log(`Auth token purge: removed ${removed} expired/used token rows`);
    });
};

import { scheduleJob } from '../utils/jobTracker.js';
import { and, isNotNull, lt, or } from 'drizzle-orm';
import { db } from '../config/db.js';
import { refreshTokens, passwordResetTokens } from '../db/schema/core.js';

// Same batching posture as auditRetention.job.ts: small deletes with a hard ceiling per run, so a
// big backlog never holds a long row lock on the auth tables (login and refresh write to them).
const BATCH_SIZE = 1000;
const MAX_BATCHES_PER_RUN = 50;
// A revoked refresh token is kept a week after revocation, so reuse detection (a stolen token
// replayed after rotation) still has something to match against before it is purged.
const REVOKED_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Daily clean-up of auth tokens nobody can use any more:
 *  - refresh tokens that have expired, or were revoked more than 7 days ago;
 *  - password-reset tokens that were used or have expired.
 * Every login/refresh/forgot-password inserts a row and nothing else ever removed them.
 */
export const startAuthTokenPurge = () => {
    // 03:20 daily, right after the audit retention sweep (03:15).
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

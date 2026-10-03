import { env } from "../config/env.js"

const DAY_MS = 86_400_000

/**
 * The real instant the org's current calendar day began (org-local midnight), as a Date.
 *
 * "New today" counts must use the org's day, not the DB session's CURDATE() (UTC on the server, so
 * an Indian store's "today" would roll over at 05:30 instead of midnight). DATETIME columns hold UTC
 * wall-clock values, so compare them against this instant, bound as a UTC string (see utcSql).
 */
export const orgDayStartUtc = (now: Date = new Date()): Date => {
    const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
    const localMidnight = Math.floor((now.getTime() + offsetMs) / DAY_MS) * DAY_MS
    return new Date(localMidnight - offsetMs)
}

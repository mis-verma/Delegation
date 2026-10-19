import { env } from "../config/env.js"

const DAY_MS = 86_400_000

export const orgDayStartUtc = (now: Date = new Date()): Date => {
    const offsetMs = env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000
    const localMidnight = Math.floor((now.getTime() + offsetMs) / DAY_MS) * DAY_MS
    return new Date(localMidnight - offsetMs)
}

import { scheduleJob } from "../utils/jobTracker.js"
import { env } from "../config/env.js"
import { pushService } from "../modules/notifications/push.service.js"

const DIGEST_HOUR_LOCAL = 9

export const startNotificationDigest = () => {
    scheduleJob("notification-digest", "*/15 * * * *", 15, async () => {
        if (!pushService.isConfigured()) return
        const now = new Date()
        const local = new Date(now.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000)
        if (local.getUTCHours() < DIGEST_HOUR_LOCAL || local.getUTCHours() > DIGEST_HOUR_LOCAL + 2) return
        const sent = await pushService.sendMorningDigest(now)
        if (sent > 0) console.log(`Notification digest: sent ${sent}`)
    })
}

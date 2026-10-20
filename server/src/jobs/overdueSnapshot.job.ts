import { scheduleJob } from "../utils/jobTracker.js"
import { overdueSnapshotService } from "../modules/reports/overdueSnapshot.service.js"

export const startOverdueSnapshot = () => {
    scheduleJob("overdue-snapshot", "55 23 * * *", 1440, async () => {
        await overdueSnapshotService.record()
    })
    void overdueSnapshotService.record().catch((err: unknown) => console.error("Overdue snapshot failed:", err))
}

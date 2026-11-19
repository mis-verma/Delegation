import { scheduleJob } from "../utils/jobTracker.js"
import { ringDueAlarms } from "../modules/checklistInstances/checklistAlarm.js"

export const startChecklistAlarms = () => {
    scheduleJob("checklist-alarms", "*/2 * * * *", 2, () => ringDueAlarms())
}

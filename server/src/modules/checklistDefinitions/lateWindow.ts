import { clockParts } from "../../utils/clock.js"
export type LateWindowInput = {
    recurrence: string
    opensTime?: string | null
    cutoffTime?: string | null
    lateUntilTime?: string | null
}

export const lateWindowProblem = (input: LateWindowInput): string | null => {
    if (!input.lateUntilTime) return null
    if (input.recurrence !== "DAILY" && input.recurrence !== "ONE_TIME") return "A late window only works on daily or one-time checklists."
    if (!input.cutoffTime) return "Set a closing time before adding a late window."
    if (input.opensTime && input.cutoffTime < input.opensTime) return "A late window can't be used when the checklist closes after midnight."
    if (input.lateUntilTime <= input.cutoffTime) return "The late window must end after the closing time."
    return null
}

export const formatClock = (time: string): string => {
    const [hours, minutes] = clockParts(time)
    const hour12 = hours % 12 === 0 ? 12 : hours % 12
    return `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`
}

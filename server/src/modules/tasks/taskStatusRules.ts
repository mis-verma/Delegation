const FORWARD_ORDER = ["draft", "todo", "in_progress", "pending_approval", "done"] as const

export const FRONT_LINE_BACK_MESSAGE =
    "Moving a delegation back is done by the person who reviews it. Ask your department head, or use Put on hold if the work has stopped."

export const isBackwardMove = (from: string, to: string): boolean => {
    const was = FORWARD_ORDER.indexOf(from as (typeof FORWARD_ORDER)[number])
    const next = FORWARD_ORDER.indexOf(to as (typeof FORWARD_ORDER)[number])
    return was !== -1 && next !== -1 && next < was
}

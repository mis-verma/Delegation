import { emitRoomEvent, type RoomTarget } from "./roomFanout.js"

type ChecklistRoomTarget = Pick<RoomTarget, "storeId">

export const emitChecklistEvent = (event: string, target: ChecklistRoomTarget, payload: unknown) => {
    try {
        emitRoomEvent(event, target, payload)
    } catch (err) {
        console.error(`Failed to emit checklist socket event "${event}":`, err)
    }
}

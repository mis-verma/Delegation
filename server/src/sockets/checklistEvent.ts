import { emitRoomEvent, type RoomTarget } from "./roomFanout.js"

type ChecklistRoomTarget = Pick<RoomTarget, "storeId">

// Checklist instances/definitions had no socket events at all before this — the Templates grid
// and My Checklists / compliance board only ever updated on a manual refresh or a React Query
// refetch interval, unlike Tasks/Tickets which push live via emitTaskEvent/emitTicketEvent. Scoped
// to storeId only (not userId/departmentId like tasks/tickets) since a checklist's real audience is
// "everyone connected to this store" — every socket auto-joins its own `store:<id>` room on
// connect (see socket.ts), so this reaches exactly the people who'd see it in their own store's
// checklist list anyway, plus ADMIN always (roomsFor's own baseline).
//
// Swallows getIO()'s "Socket.io not initialized" on purpose: generateInstanceForDefinition (which
// this is called from) is also invoked directly by one-off scripts and seed data that create/edit
// checklist definitions outside the real server bootstrap, where no socket server ever starts —
// broadcasting a live update is a nice-to-have, never something that should crash the actual
// definition/instance write around it.
export const emitChecklistEvent = (event: string, target: ChecklistRoomTarget, payload: unknown) => {
    try {
        emitRoomEvent(event, target, payload)
    } catch (err) {
        console.error(`Failed to emit checklist socket event "${event}":`, err)
    }
}

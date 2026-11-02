import { eq } from "drizzle-orm"
import { db } from "../config/db.js"
import { taskAdditionalAssignees, taskDepartmentApprovals } from "../db/schema/index.js"
import { emitRoomEvent, type RoomTarget } from "./roomFanout.js"

type TaskRoomTarget = Pick<RoomTarget, "userId" | "assigneeId" | "departmentId">

const taskIdOf = (payload: unknown): string | null =>
    payload !== null && typeof payload === "object" && "id" in payload && typeof (payload as { id: unknown }).id === "string"
        ? (payload as { id: string }).id
        : null

const alsoInvolved = async (taskId: string | null): Promise<Pick<RoomTarget, "extraUserIds" | "extraDepartmentIds">> => {
    if (!taskId) return {}
    try {
        const [people, approvals] = await Promise.all([
            db.select({ userId: taskAdditionalAssignees.userId }).from(taskAdditionalAssignees).where(eq(taskAdditionalAssignees.taskId, taskId)),
            db.select({ departmentId: taskDepartmentApprovals.departmentId }).from(taskDepartmentApprovals).where(eq(taskDepartmentApprovals.taskId, taskId)),
        ])
        return { extraUserIds: people.map((r) => r.userId), extraDepartmentIds: approvals.map((r) => r.departmentId) }
    } catch (err) {
        console.error("Task event recipients lookup failed:", err)
        return {}
    }
}

export const emitTaskEvent = (event: string, target: TaskRoomTarget, payload: unknown) => {
    void alsoInvolved(taskIdOf(payload)).then((extra) => emitRoomEvent(event, { ...target, ...extra }, payload))
}

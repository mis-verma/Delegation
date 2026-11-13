import { and, eq, inArray, ne } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/core.js"
import { activeVerifierIds, notifyMany } from "../notifications/notificationCore.js"

const DAY = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" })

export const leaveRangeText = (startDate: string, endDate: string) => {
    const from = DAY.format(new Date(`${startDate}T00:00:00Z`))
    return startDate === endDate ? from : `${from} to ${DAY.format(new Date(`${endDate}T00:00:00Z`))}`
}

const headsFor = async (userId: string, departmentId: string | null) => {
    if (!departmentId) return []
    const rows = await db.select({ id: users.id }).from(users).where(and(
        inArray(users.role, ["MANAGER", "SENIOR"]),
        eq(users.departmentId, departmentId),
        eq(users.isActive, true),
        ne(users.id, userId),
    ))
    return rows.map((r) => r.id)
}

export const notifyLeaveRequested = async (person: { id: string; name: string; departmentId: string | null }, startDate: string, endDate: string) => {
    const heads = await headsFor(person.id, person.departmentId)
    const recipients = heads.length ? heads : (await activeVerifierIds()).filter((id) => id !== person.id)
    await notifyMany(recipients, {
        type: "LEAVE_REQUESTED",
        title: "Leave request",
        message: `${person.name} asked for leave on ${leaveRangeText(startDate, endDate)}. Approve or decline it on the Leave page.`,
    })
}

export const notifyLeaveDecided = async (personId: string, approved: boolean, deciderName: string, startDate: string, endDate: string, note: string | null) => {
    const range = leaveRangeText(startDate, endDate)
    await notifyMany([personId], {
        type: approved ? "LEAVE_APPROVED" : "LEAVE_DECLINED",
        title: approved ? "Leave approved" : "Leave declined",
        message: approved
            ? `${deciderName} approved your leave on ${range}. Your checklists are skipped on those days.`
            : `${deciderName} declined your leave on ${range}.${note ? ` Note: ${note}` : ""}`,
    })
}

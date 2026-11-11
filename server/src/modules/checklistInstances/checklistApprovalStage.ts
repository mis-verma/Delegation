import { and, eq, inArray, notInArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users } from "../../db/schema/index.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"
import { approvalCoverService } from "../approvalCover/approvalCover.service.js"
import { isCoordinatorRun } from "./checklistCoordinatorRun.js"

export type ChecklistApprovalStage = "HOD" | "PC"

export type StageAuthority = { asHead: boolean; asFinal: boolean }

export type StageOutcome = "MOVE_TO_PC" | "FINAL" | "FORBIDDEN"

export const approveOutcome = (stage: ChecklistApprovalStage, authority: StageAuthority): StageOutcome => {
    if (authority.asFinal) return "FINAL"
    if (stage === "HOD" && authority.asHead) return "MOVE_TO_PC"
    return "FORBIDDEN"
}

export const canSendBackAt = (stage: ChecklistApprovalStage, authority: StageAuthority): boolean =>
    authority.asFinal || (stage === "HOD" && authority.asHead)

export const stageOf = (instance: { approvalStage: ChecklistApprovalStage | null }): ChecklistApprovalStage =>
    instance.approvalStage ?? "PC"

type Approver = { id: string; role: string; departmentId?: string | null }

const authorityOf = (person: Approver, assigneeDepartmentIds: Set<string>, reviewerIds: string[]): StageAuthority => ({
    asFinal: isAdminOrPc(person.role) || reviewerIds.includes(person.id),
    asHead: isDepartmentHeadRole(person.role) && !!person.departmentId && assigneeDepartmentIds.has(person.departmentId),
})

export const stageAuthority = async (user: AccessTokenPayload, assigneeDepartmentIds: Set<string>, reviewerIds: string[]): Promise<StageAuthority> => {
    const own = authorityOf({ id: user.sub, role: user.role, departmentId: user.departmentId }, assigneeDepartmentIds, reviewerIds)
    if (own.asFinal) return own
    const covers = await approvalCoverService.activeCoversFor(user.sub)
    return covers.reduce<StageAuthority>((acc, cover) => {
        const borrowed = authorityOf(cover, assigneeDepartmentIds, reviewerIds)
        return { asFinal: acc.asFinal || borrowed.asFinal, asHead: acc.asHead || borrowed.asHead }
    }, own)
}

export const firstApprovalStage = async (instanceId: string, assigneeIds: string[], assigneeDepartmentIds: Set<string>): Promise<ChecklistApprovalStage> => {
    if (await isCoordinatorRun(instanceId)) return "PC"
    if (!assigneeDepartmentIds.size) return "PC"
    const heads = await db.select({ id: users.id }).from(users).where(and(
        inArray(users.role, ["MANAGER", "SENIOR"]),
        inArray(users.departmentId, [...assigneeDepartmentIds]),
        eq(users.isActive, true),
        assigneeIds.length ? notInArray(users.id, assigneeIds) : undefined,
    )).limit(1)
    return heads.length ? "HOD" : "PC"
}

export const stageHeadIds = async (assigneeIds: string[], assigneeDepartmentIds: Set<string>): Promise<string[]> => {
    if (!assigneeDepartmentIds.size) return []
    const heads = await db.select({ id: users.id }).from(users).where(and(
        inArray(users.role, ["MANAGER", "SENIOR"]),
        inArray(users.departmentId, [...assigneeDepartmentIds]),
        eq(users.isActive, true),
        assigneeIds.length ? notInArray(users.id, assigneeIds) : undefined,
    ))
    return heads.map((h) => h.id)
}

import type { Role } from "../../db/schema/core.js"

type VerifierProfile = { departmentId?: string | null }

export const CAN_VERIFY_BY_ROLE: Partial<Record<Role, (assigneeDepartmentIds: Set<string>, user: VerifierProfile) => boolean>> = {
    ADMIN: () => true,
    PC: () => true,
    MANAGER: (assigneeDepartmentIds, user) => !!user.departmentId && assigneeDepartmentIds.has(user.departmentId),
    SENIOR: (assigneeDepartmentIds, user) => !!user.departmentId && assigneeDepartmentIds.has(user.departmentId),
}

export type CoverFrom = { id: string; role: Role; departmentId: string | null }

export const coverCanVerify = (from: CoverFrom, assigneeDepartmentIds: Set<string>, reviewerIds: string[]): boolean =>
    reviewerIds.includes(from.id) || (CAN_VERIFY_BY_ROLE[from.role]?.(assigneeDepartmentIds, from) ?? false)

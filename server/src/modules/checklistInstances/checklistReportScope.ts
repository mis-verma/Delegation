import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { resolveReportScope } from "../../utils/reportScope.js"

// What a caller may see on the checklist analytics reports.
//  - storeId: only runs of this store.
//  - departmentId: only runs that have at least one assignee in this department. A run carries no
//    department of its own, so this is the same rule History and the board use
//    (instanceIdsForDepartment in checklistInstance.service.ts), not the department's home store.
export type ChecklistReportScope = { storeId?: string; departmentId?: string }

/**
 * ADMIN/PC: any store they ask for, or the whole organisation.
 * MANAGER/SENIOR (both are department heads): their own department, optionally narrowed to one
 * store. A head with no department on their record fails CLOSED: null, which callers must answer
 * with no rows, never with an unfiltered query.
 * Any other role: null.
 */
export const resolveChecklistReportScope = (user: AccessTokenPayload, requestedStoreId?: string): ChecklistReportScope | null => {
    if (user.role === "ADMIN" || user.role === "PC") {
        const { storeId } = resolveReportScope(user, { storeId: requestedStoreId })
        return { storeId }
    }
    if (user.role === "MANAGER" || user.role === "SENIOR") {
        if (!user.departmentId) return null
        return { departmentId: user.departmentId, storeId: requestedStoreId }
    }
    return null
}

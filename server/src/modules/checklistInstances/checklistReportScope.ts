import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { resolveReportScope } from "../../utils/reportScope.js"

export type ChecklistReportScope = { storeId?: string; departmentId?: string }

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

import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import { resolveReportScope } from "../../utils/reportScope.js"
import { isAdminOrPc, isDepartmentHeadRole } from "../../utils/roles.js"

export type ChecklistReportScope = { storeId?: string; departmentId?: string }

export const resolveChecklistReportScope = (user: AccessTokenPayload, requestedStoreId?: string): ChecklistReportScope | null => {
    if (isAdminOrPc(user.role)) {
        const { storeId } = resolveReportScope(user, { storeId: requestedStoreId })
        return { storeId }
    }
    if (isDepartmentHeadRole(user.role)) {
        if (!user.departmentId) return null
        return { departmentId: user.departmentId, storeId: requestedStoreId }
    }
    return null
}

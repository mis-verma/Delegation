import type { AccessTokenPayload } from "../middleware/auth/auth.js"
import { db } from "../config/db.js"
import { departments } from "../db/schema/core.js"
import { eq } from "drizzle-orm"
import { isAdminOrPc } from "./roles.js"

export interface ReportScope {
    departmentId?: string;
    storeId?: string;
}

export const NO_SCOPE_ID = "__no_scope__"

export const resolveReportScope = (user: AccessTokenPayload, requested: ReportScope): ReportScope => {
    if (isAdminOrPc(user.role)) return requested;
    if (user.role === "MANAGER") return { departmentId: user.departmentId || NO_SCOPE_ID };
    if (user.role === "SENIOR") return { storeId: user.storeId || NO_SCOPE_ID };
    return {};
};

export const resolveDepartmentIdsForStore = async (storeId: string): Promise<string[]> => {
    const rows = await db.select({ id: departments.id }).from(departments).where(eq(departments.storeId, storeId));
    return rows.map((d) => d.id);
};

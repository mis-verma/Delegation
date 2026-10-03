import type { AccessTokenPayload } from "../middleware/auth/auth.js"
import { db } from "../config/db.js"
import { departments } from "../db/schema/core.js"
import { eq } from "drizzle-orm"

export interface ReportScope {
    departmentId?: string;
    storeId?: string;
}

// An id that belongs to no row. A department head with no department (or a SENIOR with no store)
// resolves to this instead of `undefined`, so the filter it feeds still applies and matches nothing.
// `undefined` would mean "no filter", i.e. every row in the organisation.
export const NO_SCOPE_ID = "__no_scope__"

// Resolves the department/store scope a caller is allowed to see on an org-wide report.
// ADMIN/PC may request any explicit scope (or none, for org-wide). MANAGER is forced to their
// own department; SENIOR is forced to their own store. A MANAGER with no department or a SENIOR
// with no store fails CLOSED: they get NO_SCOPE_ID, which matches no rows, never an org-wide view.
// Every other role gets no scope at all. Callers that need a "just my own records" fallback
// (e.g. task compliance for AGENT/USER) handle that separately, since it isn't a department/store
// concept, and report routes are role-gated so those roles do not reach here.
//
// Note: a report whose model has no departmentId (or no storeId) field just won't have that key
// read off the returned object by its caller, so e.g. a SENIOR resolves to a store scope here but
// a caller that only destructures `departmentId` (task compliance) must map the store to its
// departments itself (resolveDepartmentIdsForStore) and treat an empty list as "no rows".
export const resolveReportScope = (user: AccessTokenPayload, requested: ReportScope): ReportScope => {
    if (user.role === "ADMIN" || user.role === "PC") return requested;
    if (user.role === "MANAGER") return { departmentId: user.departmentId || NO_SCOPE_ID };
    if (user.role === "SENIOR") return { storeId: user.storeId || NO_SCOPE_ID };
    return {};
};

// Department optionally belongs to a Store (Department.storeId). A SENIOR (store-scoped) can't
// filter Task directly (it has no storeId), so we resolve every department in their store instead.
// Fails closed: an unknown store has no departments (empty list), never "no filter".

export const resolveDepartmentIdsForStore = async (storeId: string): Promise<string[]> => {
    const rows = await db.select({ id: departments.id }).from(departments).where(eq(departments.storeId, storeId));
    return rows.map((d) => d.id);
};

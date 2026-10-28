import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { Role } from "../../db/schema/core.js"

export type CoverIdentity = { id: string; role: Role; departmentId: string | null; storeId: string | null }

export const borrowAuthority = (user: AccessTokenPayload, cover: CoverIdentity): AccessTokenPayload => ({
    ...user,
    role: cover.role === "ADMIN" ? "PC" : cover.role,
    departmentId: cover.departmentId ?? undefined,
    storeId: cover.storeId ?? undefined,
})

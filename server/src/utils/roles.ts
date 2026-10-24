import type { Role } from "../db/schema/core.js"

type MaybeRole = Role | string | null | undefined

export const isAdminOrPc = (role: MaybeRole): boolean => role === "ADMIN" || role === "PC"

export const isDepartmentHeadRole = (role: MaybeRole): boolean => role === "MANAGER" || role === "SENIOR"

export const isOwnScopeRole = (role: MaybeRole): boolean => role === "AGENT" || role === "USER"

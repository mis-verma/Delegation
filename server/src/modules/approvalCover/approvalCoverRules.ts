import type { Role } from "../../db/schema/core.js"

export const COVER_ELIGIBLE_ROLES: readonly Role[] = ["ADMIN", "PC", "MANAGER", "SENIOR"]
export const MAX_COVER_DAYS = 60
export const MAX_ACTIVE_COVERS_GIVEN = 3

const DAY_MS = 86_400_000

export const isCoverEligibleRole = (role: Role): boolean => COVER_ELIGIBLE_ROLES.includes(role)

export const validateCoverWindow = (startsAt: Date, endsAt: Date, now: Date): string | null => {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return "Pick a valid start and end."
    if (endsAt.getTime() <= now.getTime()) return "The cover must end in the future."
    if (endsAt.getTime() <= startsAt.getTime()) return "The cover must end after it starts."
    if (endsAt.getTime() - startsAt.getTime() > MAX_COVER_DAYS * DAY_MS) return `A cover can last at most ${MAX_COVER_DAYS} days. Set a new one when it ends.`
    return null
}

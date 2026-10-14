import { cacheKey, invalidateKeys } from "../../config/queryCache.js"

// authenticate() used to hit the database on every single request to re-check the person's current
// role and active flag. That row is now cached for a short time. Anything that changes a field
// authenticate reads (role, isActive, department, store, password, mustChangePassword) must call
// invalidateAuthUsers() so the change takes effect immediately instead of after the TTL.
export const AUTH_USER_TTL_SECONDS = 30

export const authUserKey = (userId: string) => cacheKey("auth", "user", userId)

/** Drops the cached auth row for these people. Never throws; the TTL is the backstop. */
export const invalidateAuthUsers = (...userIds: string[]) => invalidateKeys(...userIds.map(authUserKey))

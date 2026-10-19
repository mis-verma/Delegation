import { cacheKey, invalidateKeys } from "../../config/queryCache.js"

export const AUTH_USER_TTL_SECONDS = 30

export const authUserKey = (userId: string) => cacheKey("auth", "user", userId)

export const invalidateAuthUsers = (...userIds: string[]) => invalidateKeys(...userIds.map(authUserKey))

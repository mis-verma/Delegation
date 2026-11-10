export const REVOKE_WINDOW_MS = 10 * 60 * 1000

export const revokeWindowOpen = (submittedAt: Date | null, now: number = Date.now()) =>
    !!submittedAt && now - submittedAt.getTime() <= REVOKE_WINDOW_MS

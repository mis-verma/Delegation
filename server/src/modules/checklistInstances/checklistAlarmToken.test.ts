import { describe, expect, it } from "vitest"
import { readAlarmSnoozeToken, signAlarmSnoozeToken } from "./checklistAlarmToken.js"

const SECRET = "test-secret-that-is-long-enough"
const NOW = 1_800_000_000_000

describe("alarm snooze token", () => {
    it("reads back the run and person it was made for", () => {
        const token = signAlarmSnoozeToken("run1", "user1", NOW + 60_000, SECRET)
        expect(readAlarmSnoozeToken(token, SECRET, NOW)).toEqual({ instanceId: "run1", userId: "user1" })
    })

    it("refuses a token whose person was swapped", () => {
        const token = signAlarmSnoozeToken("run1", "user1", NOW + 60_000, SECRET)
        expect(readAlarmSnoozeToken(token.replace("user1", "user2"), SECRET, NOW)).toBeNull()
    })

    it("refuses a token whose expiry was pushed back", () => {
        const token = signAlarmSnoozeToken("run1", "user1", NOW + 60_000, SECRET)
        const [i, u, , s] = token.split(".")
        expect(readAlarmSnoozeToken([i, u, String(NOW + 9_999_999), s].join("."), SECRET, NOW)).toBeNull()
    })

    it("refuses an expired token", () => {
        const token = signAlarmSnoozeToken("run1", "user1", NOW - 1, SECRET)
        expect(readAlarmSnoozeToken(token, SECRET, NOW)).toBeNull()
    })

    it("refuses a token signed with another secret, or garbage", () => {
        expect(readAlarmSnoozeToken(signAlarmSnoozeToken("run1", "user1", NOW + 60_000, "another-secret-value"), SECRET, NOW)).toBeNull()
        expect(readAlarmSnoozeToken("not.a.token", SECRET, NOW)).toBeNull()
        expect(readAlarmSnoozeToken("a.b.c.d", SECRET, NOW)).toBeNull()
    })
})

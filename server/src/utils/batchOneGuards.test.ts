import { describe, expect, it } from "vitest"
import { escapeHtml } from "./escapeHtml.js"
import { hasRoomForUploads, MIN_FREE_BYTES } from "./diskSpace.js"
import { MAX_TAT_HOURS } from "./tatLimits.js"
import { createTicketSchema } from "../modules/tickets/ticket.validation.js"

describe("escapeHtml", () => {
    it("neutralises markup in titles and names", () => {
        expect(escapeHtml(`<img src=x onerror="a()">&'`)).toBe("&lt;img src=x onerror=&quot;a()&quot;&gt;&amp;&#39;")
    })
})

describe("hasRoomForUploads", () => {
    it("refuses below the reserve and accepts at or above it", () => {
        expect(hasRoomForUploads(MIN_FREE_BYTES - 1)).toBe(false)
        expect(hasRoomForUploads(MIN_FREE_BYTES)).toBe(true)
    })
})

describe("ticket due-time cap", () => {
    const base = { title: "t", description: "d" }
    it("accepts up to 90 days and rejects more", () => {
        expect(createTicketSchema.safeParse({ ...base, tatHours: MAX_TAT_HOURS }).success).toBe(true)
        expect(createTicketSchema.safeParse({ ...base, tatHours: MAX_TAT_HOURS + 1 }).success).toBe(false)
        expect(createTicketSchema.safeParse({ ...base, tatHours: 1e9 }).success).toBe(false)
    })
})

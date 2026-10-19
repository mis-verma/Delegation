import { describe, it, expect } from "vitest"
import { resolveDueDateLocally, resolvePriorityAnswer, derivePriorityHint, containsFuzzyWord, levenshteinDistance } from "./slotFilling.js"

const REFERENCE = new Date("2026-08-19T10:00:00.000Z")

const dayOf = (date: Date) => date.toISOString().slice(0, 10)

describe("resolveDueDateLocally", () => {
    it("resolves \"today\" to the reference date", () => {
        const result = resolveDueDateLocally("today", REFERENCE)
        expect(dayOf(result!)).toBe(dayOf(REFERENCE))
    })

    it("resolves \"tomorrow\" to reference + 1 day", () => {
        const result = resolveDueDateLocally("tomorrow", REFERENCE)
        expect(dayOf(result!)).toBe("2026-08-20")
    })

    it("resolves the Hindi shorthand \"kal\" the same as tomorrow", () => {
        const result = resolveDueDateLocally("kal", REFERENCE)
        expect(dayOf(result!)).toBe("2026-08-20")
    })

    it("resolves \"in 3 days\" to reference + 3 days", () => {
        const result = resolveDueDateLocally("in 3 days", REFERENCE)
        expect(dayOf(result!)).toBe("2026-08-22")
    })

    it("resolves a weekday name to the next occurrence, never the same day", () => {
        const result = resolveDueDateLocally("wednesday", REFERENCE)
        expect(dayOf(result!)).toBe("2026-08-26")
    })

    it("resolves the nearest upcoming weekday when it isn't today", () => {
        const result = resolveDueDateLocally("friday", REFERENCE)
        expect(dayOf(result!)).toBe("2026-08-21")
    })

    it("tolerates a small typo in a weekday name via fuzzy matching", () => {
        const result = resolveDueDateLocally("mondey", REFERENCE)
        expect(dayOf(result!)).toBe("2026-08-24")
    })

    it("falls back to Date.parse for an explicit date string", () => {
        const result = resolveDueDateLocally("2026-09-01", REFERENCE)
        expect(dayOf(result!)).toBe("2026-09-01")
    })

    it("returns null for text with no recognizable date", () => {
        expect(resolveDueDateLocally("whenever is fine", REFERENCE)).toBeNull()
    })

    it("does not fuzzy-match \"today\" to the weekday \"monday\" (edit distance 2)", () => {
        const result = resolveDueDateLocally("today", REFERENCE)
        expect(dayOf(result!)).toBe(dayOf(REFERENCE))
    })
})

describe("resolvePriorityAnswer", () => {
    it("recognizes high-priority keywords", () => {
        expect(resolvePriorityAnswer("this is urgent")).toBe("high")
    })

    it("recognizes low-priority keywords", () => {
        expect(resolvePriorityAnswer("no rush at all")).toBe("low")
    })

    it("falls back to the provided default when nothing matches", () => {
        expect(resolvePriorityAnswer("just do it sometime", "medium")).toBe("medium")
    })
})

describe("derivePriorityHint", () => {
    it("returns null when no priority language is present", () => {
        expect(derivePriorityHint("assign this to the design team")).toBeNull()
    })

    it("returns high for urgent language", () => {
        expect(derivePriorityHint("please treat this as critical")).toBe("high")
    })

    it("returns low for explicit low-priority language", () => {
        expect(derivePriorityHint("low priority, no rush")).toBe("low")
    })
})

describe("containsFuzzyWord / levenshteinDistance", () => {
    it("computes edit distance between two words", () => {
        expect(levenshteinDistance("kitten", "sitting")).toBe(3)
        expect(levenshteinDistance("tomorrow", "tomorrow")).toBe(0)
    })

    it("matches a word within the allowed edit distance", () => {
        expect(containsFuzzyWord("see you tommorow", "tomorrow")).toBe(true)
    })

    it("does not match a word outside the allowed edit distance", () => {
        expect(containsFuzzyWord("see you next year", "tomorrow")).toBe(false)
    })
})

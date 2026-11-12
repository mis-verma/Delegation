import { describe, expect, it } from "vitest"
import { openMatchesMetric, runMatchesMetric } from "./workMetric.js"

describe("checklist runs per card", () => {
    const open = { skip: false, complete: false, missed: false }
    const late = { skip: false, complete: false, missed: true }
    const done = { skip: false, complete: true, missed: false }
    const notCounted = { skip: true, complete: false, missed: false }

    it("counts every run in Total, like the card", () => {
        for (const run of [open, late, done, notCounted]) expect(runMatchesMetric(run, "total")).toBe(true)
    })

    it("counts open and late runs in Pending, not finished or uncounted ones", () => {
        expect(runMatchesMetric(open, "pending")).toBe(true)
        expect(runMatchesMetric(late, "pending")).toBe(true)
        expect(runMatchesMetric(done, "pending")).toBe(false)
        expect(runMatchesMetric(notCounted, "pending")).toBe(false)
    })

    it("splits Pending into Delayed and Due with nothing in both", () => {
        expect(runMatchesMetric(late, "delayed")).toBe(true)
        expect(runMatchesMetric(late, "due")).toBe(false)
        expect(runMatchesMetric(open, "due")).toBe(true)
        expect(runMatchesMetric(open, "delayed")).toBe(false)
    })
})

describe("delegations, tickets and to-dos per card", () => {
    it("keeps finished work out of Pending, Delayed and Due", () => {
        const finished = { open: false, late: false }
        expect(openMatchesMetric(finished, "total")).toBe(true)
        expect(openMatchesMetric(finished, "pending")).toBe(false)
        expect(openMatchesMetric(finished, "delayed")).toBe(false)
        expect(openMatchesMetric(finished, "due")).toBe(false)
    })

    it("puts late open work in Delayed and on-time open work in Due", () => {
        expect(openMatchesMetric({ open: true, late: true }, "delayed")).toBe(true)
        expect(openMatchesMetric({ open: true, late: true }, "due")).toBe(false)
        expect(openMatchesMetric({ open: true, late: false }, "due")).toBe(true)
    })
})

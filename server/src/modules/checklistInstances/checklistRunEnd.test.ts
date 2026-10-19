import { describe, expect, it } from "vitest"
import { AppError } from "../../utils/AppError.js"
import {
    assertRunOpen,
    canWorkEndedRun,
    describeRunEnd,
    hasRunDeadlinePassed,
    isRunEnded,
    runClosedMessage,
    runDeadlineMs,
    type RunEndInput,
} from "./checklistRunEnd.js"

const IST = 330
const utc = (iso: string) => new Date(`${iso}Z`)

const daily = (o: Partial<RunEndInput & { totalItems: number; doneItems: number }> = {}) => ({
    recurrence: "DAILY",
    verificationStatus: "NOT_SUBMITTED",
    periodStart: utc("2026-10-12T00:00:00"),
    periodEnd: utc("2026-10-13T00:00:00"),
    cutoffTime: "18:30" as string | null,
    opensTime: null as string | null,
    totalItems: 4,
    doneItems: 1,
    ...o,
})

describe("runDeadlineMs", () => {
    it("is the cutoff on the start day, in the org's time zone", () => {
        expect(runDeadlineMs(daily(), IST)).toBe(utc("2026-10-12T13:00:00").getTime())
    })

    it("rolls an overnight window (cutoff earlier than opens) to the next day", () => {
        const run = daily({ opensTime: "18:00", cutoffTime: "07:00" })
        expect(runDeadlineMs(run, IST)).toBe(utc("2026-10-13T01:30:00").getTime())
    })

    it("does not roll a same-day window (opens earlier than cutoff)", () => {
        const run = daily({ opensTime: "09:00", cutoffTime: "18:30" })
        expect(runDeadlineMs(run, IST)).toBe(utc("2026-10-12T13:00:00").getTime())
    })

    it("is the end of the period when there is no cutoff (periodEnd is exclusive)", () => {
        expect(runDeadlineMs(daily({ cutoffTime: null }), IST)).toBe(utc("2026-10-12T18:30:00").getTime())
    })

    it("works with a zero offset", () => {
        expect(runDeadlineMs(daily(), 0)).toBe(utc("2026-10-12T18:30:00").getTime())
    })
})

describe("isRunEnded", () => {
    it("is not ended one millisecond before the cutoff and ended at the cutoff (offset 330)", () => {
        const deadline = utc("2026-10-12T13:00:00").getTime()
        expect(isRunEnded(daily(), deadline - 1, IST)).toBe(false)
        expect(isRunEnded(daily(), deadline, IST)).toBe(true)
        expect(isRunEnded(daily(), deadline + 1, IST)).toBe(true)
    })

    it("treats 12:59 UTC as still open and 13:01 UTC as ended for a 6:30 PM IST cutoff", () => {
        expect(isRunEnded(daily(), utc("2026-10-12T12:59:00"), IST)).toBe(false)
        expect(isRunEnded(daily(), utc("2026-10-12T13:01:00"), IST)).toBe(true)
    })

    it("does not end a cutoff run at local midnight: it ended at the cutoff, hours earlier", () => {
        expect(isRunEnded(daily(), utc("2026-10-12T15:30:00"), IST)).toBe(true)
    })

    it("keeps an overnight run open into the next morning and ends it at the next day's cutoff", () => {
        const run = daily({ opensTime: "18:00", cutoffTime: "07:00" })
        expect(isRunEnded(run, utc("2026-10-12T17:30:00"), IST)).toBe(false)
        expect(isRunEnded(run, utc("2026-10-13T01:29:00"), IST)).toBe(false)
        expect(isRunEnded(run, utc("2026-10-13T01:30:00"), IST)).toBe(true)
    })

    it("ends a run with no cutoff at the end of its period, exclusive", () => {
        const run = daily({ cutoffTime: null })
        const endOfDay = utc("2026-10-12T18:30:00").getTime()
        expect(isRunEnded(run, endOfDay - 1, IST)).toBe(false)
        expect(isRunEnded(run, endOfDay, IST)).toBe(true)
    })

    it("ends a weekly run (no cutoff) at its period end, not on day one", () => {
        const weekly = daily({ recurrence: "WEEKLY", cutoffTime: null, periodStart: utc("2026-10-12T00:00:00"), periodEnd: utc("2026-10-19T00:00:00") })
        expect(isRunEnded(weekly, utc("2026-10-15T08:00:00"), IST)).toBe(false)
        expect(isRunEnded(weekly, utc("2026-10-18T18:30:00"), IST)).toBe(true)
    })

    it("never ends a ONE_TIME checklist", () => {
        expect(isRunEnded(daily({ recurrence: "ONE_TIME" }), utc("2027-01-01T00:00:00"), IST)).toBe(false)
    })

    it("never ends a run that was sent back (REJECTED): it has to be corrected", () => {
        expect(isRunEnded(daily({ verificationStatus: "REJECTED" }), utc("2026-10-14T00:00:00"), IST)).toBe(false)
    })

    it("never ends a run that is fully done, even if not submitted yet", () => {
        const done = daily({ totalItems: 4, doneItems: 4, verificationStatus: "NOT_SUBMITTED" })
        expect(isRunEnded(done, utc("2026-10-14T00:00:00"), IST)).toBe(false)
    })

    it("ends a run with no questions at all", () => {
        expect(isRunEnded(daily({ totalItems: 0, doneItems: 0 }), utc("2026-10-12T13:00:00"), IST)).toBe(true)
    })

    it("accepts a Date or a number for now", () => {
        expect(isRunEnded(daily(), utc("2026-10-12T14:00:00"), IST)).toBe(true)
        expect(isRunEnded(daily(), utc("2026-10-12T14:00:00").getTime(), IST)).toBe(true)
    })
})

describe("hasRunDeadlinePassed", () => {
    it("ignores the exceptions: a sent-back run past its deadline has passed it", () => {
        const run = daily({ verificationStatus: "REJECTED" })
        expect(hasRunDeadlinePassed(run, utc("2026-10-12T14:00:00"), IST)).toBe(true)
        expect(hasRunDeadlinePassed(run, utc("2026-10-12T12:00:00"), IST)).toBe(false)
    })
})

describe("closed message", () => {
    it("names the time and day in the org's zone", () => {
        expect(runClosedMessage(utc("2026-10-12T13:00:00").getTime(), IST)).toBe(
            "This checklist closed at 6:30 PM on 12 Oct. It can't be filled in any more. Today's checklist is in My Checklists.",
        )
    })

    it("uses 12-hour clock edges", () => {
        expect(describeRunEnd(utc("2026-10-12T06:30:00").getTime(), IST)).toBe("12:00 PM on 12 Oct")
        expect(describeRunEnd(utc("2026-10-12T18:40:00").getTime(), IST)).toBe("12:10 AM on 13 Oct")
        expect(describeRunEnd(utc("2026-10-13T01:30:00").getTime(), IST)).toBe("7:00 AM on 13 Oct")
    })

    it("says the end of the day for a midnight deadline", () => {
        expect(describeRunEnd(utc("2026-10-12T18:30:00").getTime(), IST)).toBe("the end of 12 Oct")
    })
})

describe("assertRunOpen", () => {
    const after = utc("2026-10-12T14:00:00")
    const before = utc("2026-10-12T12:00:00")

    it("lets ADMIN and PC work an ended run", () => {
        expect(() => assertRunOpen(daily(), { role: "ADMIN" }, after, IST)).not.toThrow()
        expect(() => assertRunOpen(daily(), { role: "PC" }, after, IST)).not.toThrow()
        expect(canWorkEndedRun({ role: "ADMIN" })).toBe(true)
        expect(canWorkEndedRun({ role: "PC" })).toBe(true)
        expect(canWorkEndedRun({ role: "MANAGER" })).toBe(false)
    })

    it("blocks an assignee after the end, with the plain message", () => {
        for (const role of ["USER", "AGENT", "MANAGER", "SENIOR"]) {
            let error: unknown
            try { assertRunOpen(daily(), { role }, after, IST) } catch (e) { error = e }
            expect(error, role).toBeInstanceOf(AppError)
            expect((error as AppError).statusCode).toBe(400)
            expect((error as AppError).message).toBe("This checklist closed at 6:30 PM on 12 Oct. It can't be filled in any more. Today's checklist is in My Checklists.")
        }
    })

    it("allows an assignee before the end", () => {
        expect(() => assertRunOpen(daily(), { role: "USER" }, before, IST)).not.toThrow()
    })

    it("still lets an assignee fix a sent-back run, finish-and-submit a done run, and fill a one-time checklist after the end", () => {
        expect(() => assertRunOpen(daily({ verificationStatus: "REJECTED" }), { role: "USER" }, after, IST)).not.toThrow()
        expect(() => assertRunOpen(daily({ doneItems: 4 }), { role: "USER" }, after, IST)).not.toThrow()
        expect(() => assertRunOpen(daily({ recurrence: "ONE_TIME" }), { role: "USER" }, after, IST)).not.toThrow()
    })
})

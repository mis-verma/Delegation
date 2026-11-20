import { describe, expect, it } from "vitest"
import { extraDayCovers, firstWorkingDate, holidayApplies, isIdleHolidayRunFor, isScheduledDay, storesWithoutAssigneesOn, workingPeople, type ExtraDayRule } from "./workingDayRules.js"
const d = (s: string) => new Date(`${s}T00:00:00.000Z`)

const SUNDAY = 0
const MONDAY = 1

const person = (id: string, over: Partial<{ departmentId: string | null; storeId: string | null; isActive: boolean; off: number[] }> = {}) => ({
    id,
    departmentId: over.departmentId === undefined ? "accounts" : over.departmentId,
    storeId: over.storeId === undefined ? "solan" : over.storeId,
    isActive: over.isActive ?? true,
    off: over.off ?? [SUNDAY],
})
type P = ReturnType<typeof person>

const ctx = (over: Partial<Parameters<typeof workingPeople<P>>[1]> = {}) => ({
    daily: true,
    holiday: false,
    weekday: MONDAY,
    activeWeekdays: null,
    extras: [] as ExtraDayRule[],
    onLeave: new Set<string>(),
    offDaysOf: (p: P) => p.off,
    ...over,
})

const ids = (people: P[]) => people.map((p) => p.id)

describe("which recurrences a holiday stops", () => {
    it("stops every repeating checklist but not a one-time one", () => {
        expect(holidayApplies("DAILY")).toBe(true)
        expect(holidayApplies("WEEKLY")).toBe(true)
        expect(holidayApplies("TWICE_WEEKLY")).toBe(true)
        expect(holidayApplies("MONTHLY")).toBe(true)
        expect(holidayApplies("ONE_TIME")).toBe(false)
    })
})

describe("extra working day coverage", () => {
    const anna = person("anna", { departmentId: "accounts", storeId: "solan" })
    it("matches by scope", () => {
        expect(extraDayCovers({ scope: "ALL", targetIds: [] }, anna)).toBe(true)
        expect(extraDayCovers({ scope: "PEOPLE", targetIds: ["anna"] }, anna)).toBe(true)
        expect(extraDayCovers({ scope: "PEOPLE", targetIds: ["bob"] }, anna)).toBe(false)
        expect(extraDayCovers({ scope: "DEPARTMENT", targetIds: ["accounts"] }, anna)).toBe(true)
        expect(extraDayCovers({ scope: "STORE", targetIds: ["rohru"] }, anna)).toBe(false)
    })
    it("never matches a department or store the person does not have", () => {
        const loose = person("x", { departmentId: null, storeId: null })
        expect(extraDayCovers({ scope: "DEPARTMENT", targetIds: ["accounts"] }, loose)).toBe(false)
        expect(extraDayCovers({ scope: "STORE", targetIds: ["solan"] }, loose)).toBe(false)
    })
})

describe("who works on a given day", () => {
    const team = [person("anna"), person("bob", { off: [MONDAY] }), person("cara", { isActive: false })]

    it("keeps active people who are not on their week off", () => {
        expect(ids(workingPeople(team, ctx()))).toEqual(["anna"])
    })

    it("gives nobody a daily run on a holiday", () => {
        expect(workingPeople(team, ctx({ holiday: true }))).toEqual([])
    })

    it("brings back only the people an extra day covers on a holiday", () => {
        const extras: ExtraDayRule[] = [{ scope: "PEOPLE", targetIds: ["bob"] }]
        expect(ids(workingPeople(team, ctx({ holiday: true, extras })))).toEqual(["bob"])
    })

    it("lets an extra day override a person's week off and the checklist's own days", () => {
        const extras: ExtraDayRule[] = [{ scope: "ALL", targetIds: [] }]
        expect(ids(workingPeople(team, ctx({ weekday: SUNDAY, activeWeekdays: [1, 2, 3, 4, 5, 6], extras })))).toEqual(["anna", "bob"])
    })

    it("still skips someone on approved leave even when an extra day covers them", () => {
        const extras: ExtraDayRule[] = [{ scope: "ALL", targetIds: [] }]
        expect(ids(workingPeople(team, ctx({ holiday: true, extras, onLeave: new Set(["anna"]) })))).toEqual(["bob"])
    })

    it("does not apply week offs to a weekly checklist, only the holiday", () => {
        const weekly = ctx({ daily: false, weekday: MONDAY })
        expect(ids(workingPeople(team, weekly))).toEqual(["anna", "bob"])
        expect(workingPeople(team, { ...weekly, holiday: true })).toEqual([])
    })

    it("treats a day outside the checklist's active days as off", () => {
        expect(isScheduledDay({ daily: true, holiday: false, weekday: SUNDAY, activeWeekdays: [1, 2, 3, 4, 5, 6] })).toBe(false)
        expect(isScheduledDay({ daily: false, holiday: false, weekday: SUNDAY, activeWeekdays: [1, 2, 3, 4, 5, 6] })).toBe(true)
    })
})

describe("store-only checklists on an off day", () => {
    it("runs only in stores an extra day names, or everywhere for an all-staff day", () => {
        expect(storesWithoutAssigneesOn(["solan", "rohru"], [{ scope: "STORE", targetIds: ["rohru"] }])).toEqual(["rohru"])
        expect(storesWithoutAssigneesOn(["solan", "rohru"], [{ scope: "ALL", targetIds: [] }])).toEqual(["solan", "rohru"])
        expect(storesWithoutAssigneesOn(["solan"], [{ scope: "DEPARTMENT", targetIds: ["accounts"] }])).toEqual([])
    })
})

describe("holiday runs left out of scores", () => {
    const anna = person("anna")
    const run = (over: Partial<{ recurrence: string; complete: boolean; onHoliday: boolean }> = {}) =>
        ({ recurrence: "DAILY", complete: false, storeId: "solan", onHoliday: true, ...over })

    it("leaves out an unfinished run on a holiday nobody was asked to work", () => {
        expect(isIdleHolidayRunFor(run(), [], [anna])).toBe(true)
    })

    it("now also leaves out a weekly run that fell on a holiday", () => {
        expect(isIdleHolidayRunFor(run({ recurrence: "WEEKLY" }), [], [anna])).toBe(true)
    })

    it("keeps one-time runs, finished runs and normal days", () => {
        expect(isIdleHolidayRunFor(run({ recurrence: "ONE_TIME" }), [], [anna])).toBe(false)
        expect(isIdleHolidayRunFor(run({ complete: true }), [], [anna])).toBe(false)
        expect(isIdleHolidayRunFor(run({ onHoliday: false }), [], [anna])).toBe(false)
    })

    it("counts the run when an extra day covers its people or its store", () => {
        expect(isIdleHolidayRunFor(run(), [{ scope: "DEPARTMENT", targetIds: ["accounts"] }], [anna])).toBe(false)
        expect(isIdleHolidayRunFor(run(), [{ scope: "STORE", targetIds: ["solan"] }], [])).toBe(false)
        expect(isIdleHolidayRunFor(run(), [{ scope: "PEOPLE", targetIds: ["bob"] }], [anna])).toBe(true)
    })
})

describe("firstWorkingDate", () => {
    it("returns the period's first day when it is not a holiday", () => {
        expect(firstWorkingDate(d("2026-11-16"), d("2026-11-22"), new Set())).toBe("2026-11-16")
    })

    it("moves to the next day when the first day is a holiday", () => {
        expect(firstWorkingDate(d("2026-11-16"), d("2026-11-22"), new Set(["2026-11-16"]))).toBe("2026-11-17")
    })

    it("keeps moving forward through several holidays in a row", () => {
        expect(firstWorkingDate(d("2026-11-16"), d("2026-11-22"), new Set(["2026-11-16", "2026-11-17", "2026-11-18"]))).toBe("2026-11-19")
    })

    it("gives up (returns null) when every day of the period is a holiday", () => {
        const holidaySet = new Set(["2026-11-16", "2026-11-17", "2026-11-18"])
        expect(firstWorkingDate(d("2026-11-16"), d("2026-11-18"), holidaySet)).toBeNull()
    })

    it("never looks past the period's own end date", () => {
        expect(firstWorkingDate(d("2026-11-16"), d("2026-11-16"), new Set(["2026-11-16"]))).toBeNull()
    })
})

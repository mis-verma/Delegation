import { describe, expect, it } from "vitest"
import { parseClockText, parseTimeSlot } from "./checklistImportTimes.js"

describe("reading a time from a sheet cell", () => {
    it("reads 24-hour and 12-hour times", () => {
        expect(parseClockText("18:30")).toBe("18:30")
        expect(parseClockText("6:30 PM")).toBe("18:30")
        expect(parseClockText("6:30pm")).toBe("18:30")
        expect(parseClockText("9 am")).toBe("09:00")
        expect(parseClockText("12 AM")).toBe("00:00")
        expect(parseClockText("12:15 pm")).toBe("12:15")
        expect(parseClockText("6.30 p.m.")).toBe("18:30")
    })

    it("reads Excel time cells", () => {
        expect(parseClockText("1899-12-30T18:30:00.000Z")).toBe("18:30")
        expect(parseClockText("0.770833333")).toBe("18:30")
    })

    it("refuses nonsense", () => {
        expect(parseClockText("")).toBeNull()
        expect(parseClockText("25:00")).toBeNull()
        expect(parseClockText("13 pm")).toBeNull()
        expect(parseClockText("evening")).toBeNull()
    })
})

describe("reading a time slot", () => {
    it("splits on dash, en dash and 'to'", () => {
        expect(parseTimeSlot("9:30 AM - 6:30 PM")).toEqual({ opensTime: "09:30", cutoffTime: "18:30" })
        expect(parseTimeSlot("9:30 AM – 6:30 PM")).toEqual({ opensTime: "09:30", cutoffTime: "18:30" })
        expect(parseTimeSlot("10:00 to 13:00")).toEqual({ opensTime: "10:00", cutoffTime: "13:00" })
    })

    it("borrows the meridiem from the end time only when that keeps the start before the end", () => {
        expect(parseTimeSlot("4 - 6 PM")).toEqual({ opensTime: "16:00", cutoffTime: "18:00" })
        expect(parseTimeSlot("9:30 - 6:30 PM")).toEqual({ opensTime: "09:30", cutoffTime: "18:30" })
    })

    it("gives up on a single time or garbage", () => {
        expect(parseTimeSlot("6:30 PM")).toBeNull()
        expect(parseTimeSlot("morning - evening")).toBeNull()
    })
})

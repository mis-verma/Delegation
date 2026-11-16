import { describe, expect, it } from "vitest"
import { getCurrentPeriod, getUpcomingPeriod } from "./period.js"

const start = new Date("2026-10-16T00:00:00.000Z")
const at = (iso: string) => new Date(iso)

describe("getUpcomingPeriod", () => {
  it("shows the next weekly run three days before it starts", () => {
    expect(getUpcomingPeriod("WEEKLY", start, at("2026-10-20T06:00:00.000Z"), 330)?.periodKey).toBe("2026-10-23")
    expect(getUpcomingPeriod("WEEKLY", start, at("2026-10-19T20:00:00.000Z"), 330)?.periodKey).toBe("2026-10-23")
  })

  it("stays quiet earlier than three days", () => {
    expect(getUpcomingPeriod("WEEKLY", start, at("2026-10-18T06:00:00.000Z"), 330)).toBeNull()
  })

  it("never applies to daily or one-time runs", () => {
    expect(getUpcomingPeriod("DAILY", start, at("2026-10-22T06:00:00.000Z"), 330)).toBeNull()
    expect(getUpcomingPeriod("ONE_TIME", start, at("2026-10-22T06:00:00.000Z"), 330)).toBeNull()
  })

  it("covers months and the very first run", () => {
    expect(getUpcomingPeriod("MONTHLY", start, at("2026-11-14T06:00:00.000Z"), 330)?.periodKey).toBe("2026-11-16")
    expect(getUpcomingPeriod("WEEKLY", start, at("2026-10-14T06:00:00.000Z"), 330)?.periodKey).toBe("2026-10-16")
  })
})


describe("getCurrentPeriod for weekly and monthly runs", () => {
  it("is one day long and only exists on the chosen day", () => {
    const onDay = getCurrentPeriod("WEEKLY", start, at("2026-10-23T06:00:00.000Z"), 330)
    expect(onDay?.periodKey).toBe("2026-10-23")
    expect(onDay && onDay.periodEnd.getTime() - onDay.periodStart.getTime()).toBe(86_400_000)
    expect(getCurrentPeriod("WEEKLY", start, at("2026-10-25T06:00:00.000Z"), 330)).toBeNull()
  })

  it("repeats a monthly run on the same date and nothing in between", () => {
    expect(getCurrentPeriod("MONTHLY", start, at("2026-11-16T06:00:00.000Z"), 330)?.periodKey).toBe("2026-11-16")
    expect(getCurrentPeriod("MONTHLY", start, at("2026-11-20T06:00:00.000Z"), 330)).toBeNull()
    expect(getCurrentPeriod("MONTHLY", start, at("2026-10-10T06:00:00.000Z"), 330)).toBeNull()
  })

  it("uses the last day of a shorter month", () => {
    const jan31 = new Date("2026-01-31T00:00:00.000Z")
    expect(getCurrentPeriod("MONTHLY", jan31, at("2026-02-28T06:00:00.000Z"), 330)?.periodKey).toBe("2026-02-28")
    expect(getCurrentPeriod("MONTHLY", jan31, at("2026-02-27T06:00:00.000Z"), 330)).toBeNull()
  })

  it("steps quarterly and yearly runs", () => {
    expect(getCurrentPeriod("QUARTERLY", start, at("2027-01-16T06:00:00.000Z"), 330)?.periodKey).toBe("2027-01-16")
    expect(getCurrentPeriod("QUARTERLY", start, at("2026-11-16T06:00:00.000Z"), 330)).toBeNull()
    expect(getCurrentPeriod("YEARLY", start, at("2027-10-16T06:00:00.000Z"), 330)?.periodKey).toBe("2027-10-16")
  })

  it("shows the monthly run only in the three days before it", () => {
    expect(getUpcomingPeriod("MONTHLY", start, at("2026-11-12T06:00:00.000Z"), 330)).toBeNull()
    expect(getUpcomingPeriod("MONTHLY", start, at("2026-11-13T06:00:00.000Z"), 330)?.periodKey).toBe("2026-11-16")
    expect(getUpcomingPeriod("MONTHLY", start, at("2026-11-16T06:00:00.000Z"), 330)).toBeNull()
  })
})

describe("twice a week and twice a month", () => {
  const mon = new Date("2026-10-05T00:00:00.000Z")

  it("runs on exactly the two picked weekdays", () => {
    const picked = [1, 4]
    expect(getCurrentPeriod("TWICE_WEEKLY", mon, at("2026-10-12T06:00:00.000Z"), 330, picked)?.periodKey).toBe("2026-10-12")
    expect(getCurrentPeriod("TWICE_WEEKLY", mon, at("2026-10-15T06:00:00.000Z"), 330, picked)?.periodKey).toBe("2026-10-15")
    expect(getCurrentPeriod("TWICE_WEEKLY", mon, at("2026-10-13T06:00:00.000Z"), 330, picked)).toBeNull()
  })

  it("runs on the two picked dates and clamps to month end", () => {
    const picked = [1, 31]
    expect(getCurrentPeriod("TWICE_MONTHLY", mon, at("2026-11-01T06:00:00.000Z"), 330, picked)?.periodKey).toBe("2026-11-01")
    expect(getCurrentPeriod("TWICE_MONTHLY", mon, at("2026-11-30T06:00:00.000Z"), 330, picked)?.periodKey).toBe("2026-11-30")
    expect(getCurrentPeriod("TWICE_MONTHLY", mon, at("2026-11-15T06:00:00.000Z"), 330, picked)).toBeNull()
  })

  it("opens three days early and stays idle with no picked days", () => {
    expect(getUpcomingPeriod("TWICE_WEEKLY", mon, at("2026-10-12T06:00:00.000Z"), 330, 3, [1, 4])?.periodKey).toBe("2026-10-15")
    expect(getCurrentPeriod("TWICE_WEEKLY", mon, at("2026-10-12T06:00:00.000Z"), 330, null)).toBeNull()
  })
})

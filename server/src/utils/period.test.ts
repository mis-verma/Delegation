import { describe, expect, it } from "vitest"
import { getUpcomingPeriod } from "./period.js"

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

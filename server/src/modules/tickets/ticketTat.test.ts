import { describe, expect, it } from "vitest"
import { averageMs, breachPct, HOD_TAT_HOURS, hodTatLeg, userTatLeg } from "./ticketTat.js"
import { reassignPatch, reopenPatch } from "./ticketReopen.js"

const d = (iso: string) => new Date(iso)
const HOUR = 3_600_000

describe("the head's leg of the clock", () => {
  const base = { createdAt: d("2026-11-17T09:00:00Z"), assignmentApprovedAt: null, declinedAt: null, awaitingHeadApproval: true }

  it("runs from raised until the head assigns it", () => {
    const leg = hodTatLeg({ ...base, assignmentApprovedAt: d("2026-11-17T11:00:00Z") }, d("2026-11-17T20:00:00Z"))
    expect(leg).toEqual({ ms: 2 * HOUR, running: false, breached: false, targetMs: HOD_TAT_HOURS * HOUR })
  })

  it("keeps counting while the head sits on it", () => {
    const leg = hodTatLeg(base, d("2026-11-17T10:30:00Z"))
    expect(leg?.running).toBe(true)
    expect(leg?.ms).toBe(1.5 * HOUR)
  })

  it("calls it a breach past the target", () => {
    expect(hodTatLeg(base, d("2026-11-17T09:00:00Z"))?.breached).toBe(false)
    expect(hodTatLeg(base, d("2026-11-18T09:00:00Z"))?.breached).toBe(true)
  })

  it("stops at a decline, since the head answered", () => {
    const leg = hodTatLeg({ ...base, declinedAt: d("2026-11-17T10:00:00Z"), awaitingHeadApproval: false }, d("2026-11-18T09:00:00Z"))
    expect(leg).toMatchObject({ ms: HOUR, running: false })
  })

  it("has no leg when no head was ever involved", () => {
    expect(hodTatLeg({ ...base, awaitingHeadApproval: false }, d("2026-11-17T10:00:00Z"))).toBeNull()
  })
})

describe("the person's leg of the clock", () => {
  const base = { claimedAt: d("2026-11-17T12:00:00Z"), submittedAt: null, closedAt: null, tatDueAt: d("2026-11-17T16:00:00Z") }

  it("runs from the claim to the hand-in", () => {
    const leg = userTatLeg({ ...base, submittedAt: d("2026-11-17T14:00:00Z") }, d("2026-11-18T09:00:00Z"))
    expect(leg).toMatchObject({ ms: 2 * HOUR, running: false, breached: false })
  })

  it("prefers the close time over the hand-in", () => {
    const leg = userTatLeg({ ...base, submittedAt: d("2026-11-17T14:00:00Z"), closedAt: d("2026-11-17T15:00:00Z") }, d("2026-11-18T09:00:00Z"))
    expect(leg?.ms).toBe(3 * HOUR)
  })

  it("counts the wait before the claim against nobody", () => {
    const leg = userTatLeg(base, d("2026-11-17T13:00:00Z"))
    expect(leg).toMatchObject({ ms: HOUR, running: true })
  })

  it("marks a breach when the hand-in is past the due time", () => {
    expect(userTatLeg({ ...base, submittedAt: d("2026-11-17T17:00:00Z") }, d("2026-11-18T09:00:00Z"))?.breached).toBe(true)
  })

  it("has no leg until someone claims it", () => {
    expect(userTatLeg({ ...base, claimedAt: null }, d("2026-11-17T13:00:00Z"))).toBeNull()
  })
})

describe("averages across many tickets", () => {
  it("averages and rounds", () => {
    expect(averageMs([HOUR, 2 * HOUR])).toBe(1.5 * HOUR)
    expect(averageMs([])).toBeNull()
  })

  it("reads breaches as a share of what was measured", () => {
    expect(breachPct(1, 4)).toBe(25)
    expect(breachPct(1, 3)).toBe(33.3)
    expect(breachPct(0, 0)).toBeNull()
  })
})

describe("a reopened ticket coming back to the same person", () => {
  const before = { assigneeId: "u1", reopenedAssigneeId: null, sameAssigneeReopens: 0, reopenCount: 0 }

  it("counts against them when they keep it", () => {
    expect(reopenPatch(before, undefined)).toEqual({ reopenCount: 1, reopenedAssigneeId: "u1", sameAssigneeReopens: 1 })
  })

  it("leaves a different person clean", () => {
    expect(reopenPatch(before, "u2")).toEqual({ reopenCount: 1, reopenedAssigneeId: "u2", sameAssigneeReopens: 0 })
  })

  it("remembers who had it when it goes back to the pool", () => {
    expect(reopenPatch(before, null)).toEqual({ reopenCount: 1, reopenedAssigneeId: "u1", sameAssigneeReopens: 0 })
  })

  it("counts it later, when that same person claims it again", () => {
    const pooled = { reopenedAssigneeId: "u1", sameAssigneeReopens: 0, reopenCount: 1 }
    expect(reassignPatch(pooled, "u1")).toEqual({ sameAssigneeReopens: 1 })
    expect(reassignPatch(pooled, "u2")).toBeNull()
  })

  it("never counts the same reopen twice", () => {
    expect(reassignPatch({ reopenedAssigneeId: "u1", sameAssigneeReopens: 1, reopenCount: 1 }, "u1")).toBeNull()
    expect(reassignPatch({ reopenedAssigneeId: null, sameAssigneeReopens: 0, reopenCount: 0 }, "u1")).toBeNull()
  })

  it("stacks when it comes back again", () => {
    const again = { assigneeId: "u1", reopenedAssigneeId: "u1", sameAssigneeReopens: 1, reopenCount: 1 }
    expect(reopenPatch(again, undefined)).toEqual({ reopenCount: 2, reopenedAssigneeId: "u1", sameAssigneeReopens: 2 })
  })
})

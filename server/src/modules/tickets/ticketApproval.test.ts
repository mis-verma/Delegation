import { describe, expect, it } from "vitest"
import { canApproveAtStage, isDepartmentHead } from "./ticketApproval.js"

const ticket = { departmentId: "d1", assigneeId: "worker", userId: "raiser" }
const user = (role: string, sub: string, departmentId: string | null = "d1") => ({ sub, role, departmentId })

describe("canApproveAtStage", () => {
  it("lets a department head approve at the HOD stage", () => {
    expect(canApproveAtStage("HOD", ticket, user("MANAGER", "m1"), false)).toBe(true)
    expect(canApproveAtStage("HOD", ticket, user("SENIOR", "s1"), false)).toBe(true)
  })

  it("keeps heads of other departments out", () => {
    expect(canApproveAtStage("HOD", ticket, user("MANAGER", "m2", "d2"), false)).toBe(false)
  })

  it("keeps PC out of the HOD stage", () => {
    expect(canApproveAtStage("HOD", ticket, user("PC", "pc1"), false)).toBe(false)
  })

  it("stops a head approving a ticket they raised or work on", () => {
    expect(canApproveAtStage("HOD", ticket, user("MANAGER", "raiser"), false)).toBe(false)
    expect(canApproveAtStage("HOD", ticket, user("MANAGER", "worker"), false)).toBe(false)
  })

  it("lets PC and named reviewers approve at the PC stage, but not heads", () => {
    expect(canApproveAtStage("PC", ticket, user("PC", "pc1"), false)).toBe(true)
    expect(canApproveAtStage("PC", ticket, user("USER", "u1"), true)).toBe(true)
    expect(canApproveAtStage("PC", ticket, user("MANAGER", "m1"), false)).toBe(false)
  })

  it("lets an admin approve at either stage", () => {
    expect(canApproveAtStage("HOD", ticket, user("ADMIN", "a1", null), false)).toBe(true)
    expect(canApproveAtStage("PC", ticket, user("ADMIN", "a1", null), false)).toBe(true)
  })

  it("never lets the assignee approve unless admin", () => {
    expect(canApproveAtStage("PC", ticket, user("PC", "worker"), false)).toBe(false)
  })
})

describe("isDepartmentHead", () => {
  it("needs the same department", () => {
    expect(isDepartmentHead(user("MANAGER", "m1"), { departmentId: "d1" })).toBe(true)
    expect(isDepartmentHead(user("MANAGER", "m1", null), { departmentId: "d1" })).toBe(false)
    expect(isDepartmentHead(user("USER", "u1"), { departmentId: "d1" })).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import { approveOutcome, canSendBackAt, stageOf } from "./checklistApprovalStage.js"

const head = { asHead: true, asFinal: false }
const pc = { asHead: false, asFinal: true }
const nobody = { asHead: false, asFinal: false }

describe("checklist approval stages", () => {
    it("moves a head's approval on to PC", () => {
        expect(approveOutcome("HOD", head)).toBe("MOVE_TO_PC")
    })

    it("lets PC or Admin give the final OK at either stage", () => {
        expect(approveOutcome("HOD", pc)).toBe("FINAL")
        expect(approveOutcome("PC", pc)).toBe("FINAL")
    })

    it("stops a head once the run has moved on to PC", () => {
        expect(approveOutcome("PC", head)).toBe("FORBIDDEN")
        expect(canSendBackAt("PC", head)).toBe(false)
    })

    it("lets the head send back while it is with them", () => {
        expect(canSendBackAt("HOD", head)).toBe(true)
    })

    it("refuses anyone without authority", () => {
        expect(approveOutcome("HOD", nobody)).toBe("FORBIDDEN")
        expect(canSendBackAt("HOD", nobody)).toBe(false)
    })

    it("treats an older run with no stage as waiting for PC", () => {
        expect(stageOf({ approvalStage: null })).toBe("PC")
    })
})

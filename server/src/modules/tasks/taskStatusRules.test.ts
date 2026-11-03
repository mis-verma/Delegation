import { describe, expect, it } from "vitest"
import { isBackwardMove } from "./taskStatusRules.js"

describe("isBackwardMove", () => {
    it("sees going back along the normal path", () => {
        expect(isBackwardMove("in_progress", "todo")).toBe(true)
        expect(isBackwardMove("pending_approval", "in_progress")).toBe(true)
        expect(isBackwardMove("done", "in_progress")).toBe(true)
    })
    it("lets forward moves through", () => {
        expect(isBackwardMove("todo", "in_progress")).toBe(false)
        expect(isBackwardMove("in_progress", "pending_approval")).toBe(false)
    })
    it("does not treat holding or resuming as going back", () => {
        expect(isBackwardMove("in_progress", "on_hold")).toBe(false)
        expect(isBackwardMove("todo", "on_hold")).toBe(false)
        expect(isBackwardMove("on_hold", "in_progress")).toBe(false)
    })
    it("ignores a move to the same status", () => {
        expect(isBackwardMove("todo", "todo")).toBe(false)
    })
})

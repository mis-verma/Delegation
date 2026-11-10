import { describe, expect, it } from "vitest"
import { addRunQuestions, emptyQuestionTally, fillCountsOf } from "./fillCounts.js"

describe("fill counts", () => {
    it("counts questions of due runs only, so 8 questions over 6 days is 48", () => {
        const t = emptyQuestionTally()
        for (let i = 0; i < 6; i++) addRunQuestions(t, { state: i === 5 ? "missed" : "done", total: 8, done: i === 5 ? 1 : 8 })
        addRunQuestions(t, { state: "open", total: 8, done: 3 })
        const c = fillCountsOf(t, 0, 0)
        expect(c.questionsDue).toBe(48)
        expect(c.questionsDone).toBe(41)
        expect(c.questionsPct).toBe(85.4)
    })

    it("never counts more done than due and rounds answers to one decimal", () => {
        const t = emptyQuestionTally()
        addRunQuestions(t, { state: "late", total: 4, done: 6 })
        const c = fillCountsOf(t, 3.333, 4)
        expect(c.questionsDone).toBe(4)
        expect(c.answersGood).toBe(3.3)
        expect(c.answersChecked).toBe(4)
    })

    it("has no percentage when nothing was due", () => {
        expect(fillCountsOf(emptyQuestionTally(), 0, 0).questionsPct).toBeNull()
    })
})

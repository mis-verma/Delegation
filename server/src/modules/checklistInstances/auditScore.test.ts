import { describe, expect, it } from "vitest"
import { AUDIT_PASS_PCT, auditItemScore, auditPasses, personAuditScore } from "./auditScore.js"

const person = (ticked: number, total: number, extra: Partial<{ isDone: boolean; isNotApplicable: boolean }> = {}) => ({
    isDone: true,
    isNotApplicable: false,
    ...extra,
    accessories: Array.from({ length: total }, (_, i) => ({ checked: i < ticked })),
})

describe("audit score", () => {
    it("scores a person as ticked items over items on their list", () => {
        expect(personAuditScore(person(4, 5))).toBe(0.8)
        expect(personAuditScore(person(0, 3))).toBe(0)
    })

    it("leaves out people who are not applicable, not submitted, or have no list", () => {
        expect(personAuditScore(person(5, 5, { isNotApplicable: true }))).toBeNull()
        expect(personAuditScore(person(5, 5, { isDone: false }))).toBeNull()
        expect(personAuditScore(person(0, 0))).toBeNull()
    })

    it("averages people, not items", () => {
        expect(auditItemScore([person(1, 1), person(1, 4)])).toBeCloseTo(0.625)
        expect(auditItemScore([person(2, 2), person(3, 3, { isNotApplicable: true }), person(0, 3, { isDone: false })])).toBe(1)
    })

    it("has no score when nobody counts", () => {
        expect(auditItemScore([])).toBeNull()
        expect(auditItemScore([person(1, 2, { isNotApplicable: true })])).toBeNull()
    })

    it("passes at 80% and above", () => {
        expect(AUDIT_PASS_PCT).toBe(80)
        expect(auditPasses(0.8)).toBe(true)
        expect(auditPasses(auditItemScore([person(4, 5), person(4, 5)])!)).toBe(true)
        expect(auditPasses(0.7999)).toBe(false)
    })
})

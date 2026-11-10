import { describe, expect, it } from "vitest"
import { AUDIT_PASS_PCT, auditItemScore, auditMissedCritical, auditPasses, personAuditScore, personMissedCritical } from "./auditScore.js"

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

    it("scores a person 0 when a critical item is missing", () => {
        const missed = { isDone: true, isNotApplicable: false, accessories: [{ checked: true }, { checked: true }, { checked: false, isCritical: true }] }
        expect(personMissedCritical(missed)).toBe(true)
        expect(personAuditScore(missed)).toBe(0)
    })

    it("keeps the plain count when every critical item is ticked", () => {
        const kept = { isDone: true, isNotApplicable: false, accessories: [{ checked: true, isCritical: true }, { checked: false }, { checked: true }] }
        expect(personMissedCritical(kept)).toBe(false)
        expect(personAuditScore(kept)).toBeCloseTo(2 / 3)
    })

    it("ignores critical misses from people who are not counted", () => {
        const notSubmitted = { isDone: false, isNotApplicable: false, accessories: [{ checked: false, isCritical: true }] }
        const na = { isDone: true, isNotApplicable: true, accessories: [{ checked: false, isCritical: true }] }
        expect(auditMissedCritical([notSubmitted, na])).toBe(false)
    })

    it("fails the audit on a critical miss even when the average is 80% or more", () => {
        const people = [
            ...Array.from({ length: 9 }, () => person(5, 5)),
            { isDone: true, isNotApplicable: false, accessories: [{ checked: false, isCritical: true }, { checked: true }] },
        ]
        const score = auditItemScore(people)!
        expect(score).toBeCloseTo(0.9)
        expect(auditMissedCritical(people)).toBe(true)
        expect(auditPasses(score, auditMissedCritical(people))).toBe(false)
        expect(auditPasses(score)).toBe(true)
    })

    it("weights items by their points", () => {
        const weighted = { isDone: true, isNotApplicable: false, accessories: [{ checked: true, points: 5 }, { checked: false, points: 2 }, { checked: true, points: 3 }] }
        expect(personAuditScore(weighted)).toBeCloseTo(0.8)
        expect(auditPasses(personAuditScore(weighted)!)).toBe(true)
    })

    it("gives the same score as a plain count when every item is worth 1 point", () => {
        const plain = person(3, 4)
        const ones = { ...plain, accessories: plain.accessories.map((a) => ({ ...a, points: 1 })) }
        expect(personAuditScore(ones)).toBe(personAuditScore(plain))
        expect(personAuditScore(ones)).toBe(0.75)
    })

    it("still scores 0 for a critical miss, whatever the points", () => {
        const heavy = { isDone: true, isNotApplicable: false, accessories: [{ checked: true, points: 50 }, { checked: false, points: 1, isCritical: true }] }
        expect(personAuditScore(heavy)).toBe(0)
    })

    it("treats a missing or zero points value as 1", () => {
        const odd = { isDone: true, isNotApplicable: false, accessories: [{ checked: true, points: 0 }, { checked: false, points: null }] }
        expect(personAuditScore(odd)).toBe(0.5)
    })
})

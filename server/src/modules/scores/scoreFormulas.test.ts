import { describe, expect, it } from "vitest"
import {
    isRankable,
    lateOf,
    metDeadlinePct,
    MIN_RANK_VOLUME,
    notDone,
    onTimeOfFinishedPct,
    overallOf,
    pooledComplianceRaw,
    pooledCompliancePct,
    runCompletionPct,
    tallyRuns,
    type RunOutcome,
} from "./scoreFormulas.js"

const run = (id: string, o: Partial<RunOutcome> = {}): RunOutcome => ({ id, complete: false, onTime: false, missed: false, ...o })

describe("tallyRuns", () => {
    it("counts a shared missed run once at org level and once per person", () => {
        const shared = run("r1", { missed: true })
        const org = tallyRuns([shared, shared, shared])
        expect(org.assigned).toBe(1)
        expect(org.missed).toBe(1)
        expect(org.due).toBe(1)
        for (const person of ["a", "b", "c"]) {
            const own = tallyRuns([shared])
            expect(own.missed, person).toBe(1)
            expect(own.due, person).toBe(1)
        }
    })

    it("leaves an open run before its deadline out of completion, due and on time", () => {
        const t = tallyRuns([run("done", { complete: true, onTime: true }), run("open")])
        expect(t.assigned).toBe(2)
        expect(t.open).toBe(1)
        expect(t.due).toBe(1)
        expect(runCompletionPct(t)).toBe(100)
        expect(onTimeOfFinishedPct(t.onTime, t.completed)).toBe(100)
        expect(metDeadlinePct(t.onTime, t.due)).toBe(100)
    })

    it("gives an open run no partial credit once it is missed", () => {
        const t = tallyRuns([run("done", { complete: true, onTime: true }), run("late-miss", { missed: true })])
        expect(t.due).toBe(2)
        expect(runCompletionPct(t)).toBe(50)
    })

    it("separates on time of finished from met deadline", () => {
        const runs = [
            run("1", { complete: true, onTime: true }),
            run("2", { complete: true, onTime: true }),
            run("3", { complete: true, onTime: true }),
            run("4", { complete: true, onTime: false }),
            run("5", { missed: true }),
            run("6", { missed: true }),
        ]
        const t = tallyRuns(runs)
        expect(onTimeOfFinishedPct(t.onTime, t.completed)).toBe(75)
        expect(metDeadlinePct(t.onTime, t.due)).toBe(50)
        expect(runCompletionPct(t)).toBeCloseTo(66.7, 1)
        expect(lateOf(t.completed, t.onTime)).toBe(1)
    })

    it("returns null percentages when nothing is due", () => {
        const t = tallyRuns([run("open")])
        expect(runCompletionPct(t)).toBeNull()
        expect(metDeadlinePct(t.onTime, t.due)).toBeNull()
        expect(onTimeOfFinishedPct(0, 0)).toBeNull()
    })
})

describe("pooled compliance", () => {
    it("pools raw weights instead of averaging percentages (2 checks at 100% + 200 checks at 50% = 50.5%)", () => {
        const a = { weightedGood: 2, weightedScored: 2 }
        const b = { weightedGood: 100, weightedScored: 200 }
        expect(pooledCompliancePct([a, b])).toBe(50.5)
        expect((100 + 50) / 2).toBe(75)
        expect(pooledComplianceRaw([a, b])).toBeCloseTo(102 / 202 * 100, 10)
    })

    it("is null with nothing checked", () => {
        expect(pooledCompliancePct([])).toBeNull()
        expect(pooledCompliancePct([{ weightedGood: 0, weightedScored: 0 }])).toBeNull()
    })
})

describe("notDone", () => {
    it("is due minus done, so waiting for approval stays not done", () => {
        expect(notDone(10, 6)).toBe(4)
    })

    it("never goes below zero", () => {
        expect(notDone(3, 5)).toBe(0)
    })
})

describe("overallOf", () => {
    it("averages unrounded inputs and rounds once at the end", () => {
        const third = (1 / 3) * 100
        const out = overallOf([{ due: 3, completion: third, compliance: third }, { due: 1, completion: 100, compliance: null }])
        expect(out).toBe(55.6)
    })

    it("skips modules with nothing due and returns null when nothing was due", () => {
        expect(overallOf([{ due: 0, completion: 100, compliance: 100 }])).toBeNull()
        expect(overallOf([{ due: 0, completion: 0, compliance: 0 }, { due: 5, completion: 80, compliance: 60 }])).toBe(70)
    })
})

describe("rankable", () => {
    it("needs at least MIN_RANK_VOLUME due items", () => {
        expect(isRankable(MIN_RANK_VOLUME - 1)).toBe(false)
        expect(isRankable(MIN_RANK_VOLUME)).toBe(true)
        expect(isRankable(tallyRuns([run("a"), run("b")]).due)).toBe(false)
    })
})

import { describe, expect, it } from "vitest"
import { personFillFigures, type PersonRunFact } from "./personFill.js"

const run = (instanceId: string, day: string, over: Partial<PersonRunFact> = {}): PersonRunFact => ({
    instanceId, day, totalItems: 8, doneItems: 8, missed: false, filled: true, onTime: true, ...over,
})

describe("personFillFigures", () => {
    it("counts 8 questions a day over past days and leaves today's open day out", () => {
        const runs = [
            run("a", "2026-11-03"),
            run("b", "2026-11-04", { onTime: false }),
            run("c", "2026-11-05", { doneItems: 3, filled: false, missed: true, onTime: false }),
            run("d", "2026-11-06", { doneItems: 2, filled: false }),
        ]
        const f = personFillFigures(runs, [], "2026-11-06")
        expect(f.questionsDue).toBe(24)
        expect(f.questionsDone).toBe(19)
        expect(f.runsDue).toBe(3)
        expect(f.runsOnTime).toBe(1)
        expect(f.metDeadlinePct).toBe(33.3)
    })

    it("counts today once it is filled or missed", () => {
        const f = personFillFigures([run("a", "2026-11-06")], [], "2026-11-06")
        expect(f.runsDue).toBe(1)
        expect(f.questionsDue).toBe(8)
    })

    it("only counts answers on runs that are in the counts", () => {
        const runs = [run("a", "2026-11-05"), run("b", "2026-11-06", { filled: false, doneItems: 1 })]
        const f = personFillFigures(runs, [{ instanceId: "a", good: 7, scored: 8 }, { instanceId: "b", good: 1, scored: 1 }], "2026-11-06")
        expect(f.answersGood).toBe(7)
        expect(f.answersChecked).toBe(8)
        expect(f.compliancePct).toBe(87.5)
    })
})

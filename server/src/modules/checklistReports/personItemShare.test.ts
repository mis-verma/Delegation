import { describe, expect, it } from "vitest"
import { personItemShare } from "./personItemShare.js"

const shared = { id: "r1", itemsTotal: 8, itemsDone: 7, assigneeCount: 3 }
const answered: Record<string, number> = { a: 5, b: 2, c: 0 }

describe("personItemShare", () => {
    it("credits each person their own answers plus an equal share of what is still open", () => {
        const a = personItemShare([shared], () => answered.a!, () => 7)
        const b = personItemShare([shared], () => answered.b!, () => 7)
        const c = personItemShare([shared], () => answered.c!, () => 7)
        expect(a).toEqual({ itemsDue: 5.3, itemsDone: 5 })
        expect(b).toEqual({ itemsDue: 2.3, itemsDone: 2 })
        expect(c).toEqual({ itemsDue: 0.3, itemsDone: 0 })
        expect(a.itemsDue + b.itemsDue + c.itemsDue).toBeCloseTo(8, 0)
    })

    it("counts a run with one person in full", () => {
        expect(personItemShare([{ id: "r2", itemsTotal: 8, itemsDone: 6, assigneeCount: 1 }], () => 0, () => 0)).toEqual({ itemsDue: 8, itemsDone: 6 })
    })

    it("splits answers given by someone not assigned, such as an admin", () => {
        const run = { id: "r3", itemsTotal: 6, itemsDone: 6, assigneeCount: 2 }
        expect(personItemShare([run], () => 2, () => 2)).toEqual({ itemsDue: 4, itemsDone: 4 })
        expect(personItemShare([run], () => 0, () => 2)).toEqual({ itemsDue: 2, itemsDone: 2 })
    })

    it("counts the same run once", () => {
        expect(personItemShare([shared, shared], () => 5, () => 7)).toEqual({ itemsDue: 5.3, itemsDone: 5 })
    })
})

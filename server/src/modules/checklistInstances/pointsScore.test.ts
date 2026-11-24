import { describe, expect, it } from "vitest"
import { floorPoints, itemPoints, pctOf, sectionPoints, totalPoints, type PointScorable } from "./pointsScore.js"

const rating = (over: Partial<PointScorable> = {}): PointScorable => ({
    itemType: "RATING",
    isDone: true,
    isNotApplicable: false,
    numericValue: 5,
    ratingScale: 5,
    ...over,
})

describe("itemPoints", () => {
    it("scores a rating against its own scale", () => {
        expect(itemPoints(rating({ numericValue: 3 }))).toEqual({ earned: 3, max: 5, pct: 60 })
        expect(itemPoints(rating({ numericValue: 7, ratingScale: 10 }))).toEqual({ earned: 7, max: 10, pct: 70 })
    })

    it("counts an unanswered question as nothing earned, but still asked for", () => {
        expect(itemPoints(rating({ isDone: false, numericValue: null }))).toEqual({ earned: 0, max: 5, pct: 0 })
    })

    it("leaves out anything that cannot carry points", () => {
        expect(itemPoints(rating({ itemType: "YES_NO" }))).toBeNull()
        expect(itemPoints(rating({ isNotApplicable: true }))).toBeNull()
        expect(itemPoints(rating({ waivedAt: new Date() }))).toBeNull()
        expect(itemPoints(rating({ ratingScale: 0 }))).toBeNull()
        expect(itemPoints(rating({ ratingScale: null }))).toBeNull()
    })

    it("refuses to let a stored value score beyond its scale, or below nothing", () => {
        expect(itemPoints(rating({ numericValue: 9 }))).toEqual({ earned: 5, max: 5, pct: 100 })
        expect(itemPoints(rating({ numericValue: -2 }))).toEqual({ earned: 0, max: 5, pct: 0 })
    })
})

describe("pctOf", () => {
    it("keeps one decimal and says nothing when nothing is on offer", () => {
        expect(pctOf(1, 3)).toBe(33.3)
        expect(pctOf(2, 3)).toBe(66.7)
        expect(pctOf(0, 0)).toBeNull()
    })
})

describe("totalPoints", () => {
    it("adds the whole audit up", () => {
        const items = [rating({ numericValue: 3 }), rating({ numericValue: 5 }), rating({ numericValue: 4 })]
        expect(totalPoints(items)).toEqual({ earned: 12, max: 15, pct: 80 })
    })

    it("is null rather than zero when no question can be scored", () => {
        expect(totalPoints([rating({ itemType: "YES_NO" })])).toEqual({ earned: 0, max: 0, pct: null })
        expect(totalPoints([])).toEqual({ earned: 0, max: 0, pct: null })
    })

    it("ignores a waived question on both sides of the sum", () => {
        const items = [rating({ numericValue: 5 }), rating({ numericValue: 1, waivedAt: new Date() })]
        expect(totalPoints(items)).toEqual({ earned: 5, max: 5, pct: 100 })
    })
})

describe("sectionPoints", () => {
    const items = [
        rating({ floor: "Floor 1", section: "Washrooms", sectionOwnerId: "u1", numericValue: 3 }),
        rating({ floor: "Floor 1", section: "Washrooms", sectionOwnerId: "u1", numericValue: 5 }),
        rating({ floor: "Floor 1", section: "Corridors", sectionOwnerId: "u2", numericValue: 4 }),
        rating({ floor: "Floor 2", section: "Lobby", sectionOwnerId: "u3", numericValue: 2, isDone: false }),
    ]

    it("tallies each section on its own and keeps who answers for it", () => {
        const sections = sectionPoints(items)
        expect(sections).toHaveLength(3)
        expect(sections[0]).toMatchObject({ floor: "Floor 1", section: "Washrooms", sectionOwnerId: "u1", earned: 8, max: 10, pct: 80, scored: 2, answered: 2 })
        expect(sections[1]).toMatchObject({ floor: "Floor 1", section: "Corridors", earned: 4, max: 5, pct: 80 })
        expect(sections[2]).toMatchObject({ floor: "Floor 2", section: "Lobby", earned: 0, max: 5, pct: 0, answered: 0 })
    })

    it("keeps two sections of the same name apart when they sit on different floors", () => {
        const sections = sectionPoints([
            rating({ floor: "Floor 1", section: "Washrooms", numericValue: 5 }),
            rating({ floor: "Floor 2", section: "Washrooms", numericValue: 1 }),
        ])
        expect(sections).toHaveLength(2)
        expect(sections.map((s) => s.pct)).toEqual([100, 20])
    })

    it("handles questions with no floor or section at all", () => {
        const sections = sectionPoints([rating({ numericValue: 4 })])
        expect(sections).toHaveLength(1)
        expect(sections[0]).toMatchObject({ floor: null, section: null, pct: 80 })
    })
})

describe("floorPoints", () => {
    it("rolls the sections up into their floors and keeps both levels", () => {
        const floors = floorPoints([
            rating({ floor: "Floor 1", section: "Washrooms", numericValue: 3 }),
            rating({ floor: "Floor 1", section: "Corridors", numericValue: 5 }),
            rating({ floor: "Floor 2", section: "Lobby", numericValue: 1 }),
        ])
        expect(floors).toHaveLength(2)
        expect(floors[0]).toMatchObject({ floor: "Floor 1", earned: 8, max: 10, pct: 80 })
        expect(floors[0]?.sections.map((s) => s.section)).toEqual(["Washrooms", "Corridors"])
        expect(floors[1]).toMatchObject({ floor: "Floor 2", earned: 1, max: 5, pct: 20 })
    })

    it("agrees with the overall total", () => {
        const items = [
            rating({ floor: "A", section: "x", numericValue: 2 }),
            rating({ floor: "B", section: "y", numericValue: 4 }),
            rating({ floor: "B", section: "z", numericValue: 5, ratingScale: 10 }),
        ]
        const floors = floorPoints(items)
        const earned = floors.reduce((n, f) => n + f.earned, 0)
        const max = floors.reduce((n, f) => n + f.max, 0)
        expect({ earned, max }).toEqual({ earned: totalPoints(items).earned, max: totalPoints(items).max })
    })
})

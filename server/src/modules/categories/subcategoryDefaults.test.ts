import { describe, expect, it } from "vitest"
import type { CategoryDefaults } from "./categoryDefaults.js"
import { checkSubcategoryChoice, mergeSubcategory } from "./subcategoryDefaults.js"

const base: CategoryDefaults = { found: true, isActive: true, priority: "MEDIUM", tagIds: ["t"], departmentId: "d", tatHours: 24, assigneeId: "a" }

describe("mergeSubcategory", () => {
    it("keeps the category values when the subcategory sets nothing", () => {
        expect(mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: null })).toEqual(base)
        expect(mergeSubcategory(base, null)).toEqual(base)
    })

    it("lets the subcategory override only what it sets", () => {
        const merged = mergeSubcategory(base, { priority: "HIGH", tatHours: null, assigneeId: "b" })
        expect(merged).toEqual({ ...base, priority: "HIGH", assigneeId: "b" })
    })

    it("adds the subcategory labels on top of the category labels without repeats", () => {
        const merged = mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: null, tagIds: ["t", "u"] })
        expect(merged.tagIds).toEqual(["t", "u"])
        expect(mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: null }).tagIds).toEqual(["t"])
    })

    it("treats a zero tat as a value, not as empty", () => {
        expect(mergeSubcategory(base, { priority: null, tatHours: 0, assigneeId: null }).tatHours).toBe(0)
    })
})

describe("checkSubcategoryChoice", () => {
    const sub = { categoryId: "c1", isActive: true }

    it("needs a subcategory only when the category has active ones", () => {
        expect(checkSubcategoryChoice("c1", null, undefined, 2)).toEqual({ ok: false, message: "Pick a subcategory for this category." })
        expect(checkSubcategoryChoice("c1", null, undefined, 0)).toEqual({ ok: true })
    })

    it("accepts a subcategory of the same category", () => {
        expect(checkSubcategoryChoice("c1", sub, "s1", 2)).toEqual({ ok: true })
    })

    it("refuses one from another category, an inactive one, or one with no category", () => {
        expect(checkSubcategoryChoice("c2", sub, "s1", 2).ok).toBe(false)
        expect(checkSubcategoryChoice("c1", { ...sub, isActive: false }, "s1", 2).ok).toBe(false)
        expect(checkSubcategoryChoice(undefined, sub, "s1", 0).ok).toBe(false)
        expect(checkSubcategoryChoice("c1", null, "s1", 2).ok).toBe(false)
    })
})

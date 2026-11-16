import { describe, expect, it } from "vitest"
import type { CategoryDefaults } from "./categoryDefaults.js"
import { checkSubcategoryChoice, mergeSubcategory } from "./subcategoryDefaults.js"

const base: CategoryDefaults = { found: true, isActive: true, priority: "MEDIUM", departmentId: "d", tatHours: 24, assigneeId: "a" }

describe("mergeSubcategory", () => {
    it("keeps the category values when the subcategory sets nothing", () => {
        expect(mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: null })).toEqual(base)
        expect(mergeSubcategory(base, null)).toEqual(base)
    })

    it("lets the subcategory override only what it sets", () => {
        const merged = mergeSubcategory(base, { priority: "HIGH", tatHours: null, assigneeId: "b" })
        expect(merged).toEqual({ ...base, priority: "HIGH", assigneeId: "b" })
    })

    it("uses the subcategory department and drops the category assignee when it differs", () => {
        const merged = mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: null, departmentId: "d2" })
        expect(merged.departmentId).toBe("d2")
        expect(merged.assigneeId).toBeNull()
    })

    it("keeps the category assignee when the subcategory department is the same or unset", () => {
        expect(mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: null, departmentId: "d" }).assigneeId).toBe("a")
        expect(mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: null, departmentId: null })).toEqual(base)
    })

    it("keeps an assignee set on the subcategory even with another department", () => {
        const merged = mergeSubcategory(base, { priority: null, tatHours: null, assigneeId: "b", departmentId: "d2" })
        expect(merged).toMatchObject({ departmentId: "d2", assigneeId: "b" })
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

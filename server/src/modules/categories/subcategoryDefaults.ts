import { and, eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { categorySubcategories, users } from "../../db/schema/core.js"
import { categorySubcategoryTags } from "../../db/schema/ticket.js"
import type { CategoryDefaults } from "./categoryDefaults.js"

export type SubcategoryOverrides = {
    id: string
    categoryId: string
    name: string
    isActive: boolean
    priority: CategoryDefaults["priority"]
    tatHours: number | null
    assigneeId: string | null
    tagIds: string[]
}

export const mergeSubcategory = (base: CategoryDefaults, sub: (Pick<SubcategoryOverrides, "priority" | "tatHours" | "assigneeId"> & { tagIds?: readonly string[] }) | null): CategoryDefaults =>
    sub
        ? {
            ...base,
            priority: sub.priority ?? base.priority,
            tatHours: sub.tatHours ?? base.tatHours,
            assigneeId: sub.assigneeId ?? base.assigneeId,
            tagIds: [...new Set([...base.tagIds, ...(sub.tagIds ?? [])])],
        }
        : base

export const loadSubcategory = async (subcategoryId: string | null | undefined): Promise<SubcategoryOverrides | null> => {
    if (!subcategoryId) return null
    const [row] = await db.select({
        id: categorySubcategories.id,
        categoryId: categorySubcategories.categoryId,
        name: categorySubcategories.name,
        isActive: categorySubcategories.isActive,
        priority: categorySubcategories.priority,
        tatHours: categorySubcategories.tatHours,
        assigneeId: categorySubcategories.assigneeId,
        assigneeActive: users.isActive,
    })
        .from(categorySubcategories)
        .leftJoin(users, eq(users.id, categorySubcategories.assigneeId))
        .where(eq(categorySubcategories.id, subcategoryId))
        .limit(1)
    if (!row) return null
    const { assigneeActive, ...rest } = row
    const links = await db.select({ tagId: categorySubcategoryTags.tagId }).from(categorySubcategoryTags).where(eq(categorySubcategoryTags.subcategoryId, subcategoryId))
    return { ...rest, assigneeId: rest.assigneeId && assigneeActive ? rest.assigneeId : null, tagIds: links.map((link) => link.tagId) }
}

export const activeSubcategoryCount = async (categoryId: string): Promise<number> => {
    const rows = await db.select({ id: categorySubcategories.id }).from(categorySubcategories)
        .where(and(eq(categorySubcategories.categoryId, categoryId), eq(categorySubcategories.isActive, true)))
    return rows.length
}

export type SubcategoryCheck = { ok: true } | { ok: false; message: string }

export const checkSubcategoryChoice = (
    categoryId: string | null | undefined,
    sub: Pick<SubcategoryOverrides, "categoryId" | "isActive"> | null,
    subcategoryId: string | null | undefined,
    activeCount: number,
): SubcategoryCheck => {
    if (!categoryId) {
        return subcategoryId ? { ok: false, message: "Pick a category before a subcategory." } : { ok: true }
    }
    if (subcategoryId) {
        if (!sub || sub.categoryId !== categoryId) return { ok: false, message: "That subcategory does not belong to the chosen category." }
        if (!sub.isActive) return { ok: false, message: "That subcategory is not available any more. Pick another one." }
        return { ok: true }
    }
    return activeCount > 0 ? { ok: false, message: "Pick a subcategory for this category." } : { ok: true }
}

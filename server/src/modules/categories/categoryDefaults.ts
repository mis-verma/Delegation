import { eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { categories } from "../../db/schema/core.js"
import { categoryTags } from "../../db/schema/ticket.js"

export type CategoryDefaults = {
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null
    tagIds: string[]
}

const NONE: CategoryDefaults = { priority: null, tagIds: [] }

export const categoryDefaults = async (categoryId: string | null | undefined): Promise<CategoryDefaults> => {
    if (!categoryId) return NONE
    const [row] = await db.select({ priority: categories.priority }).from(categories).where(eq(categories.id, categoryId)).limit(1)
    if (!row) return NONE
    const links = await db.select({ tagId: categoryTags.tagId }).from(categoryTags).where(eq(categoryTags.categoryId, categoryId))
    return { priority: row.priority ?? null, tagIds: links.map((link) => link.tagId) }
}

export const mergeTagIds = (given: readonly string[] | undefined, defaults: readonly string[]): string[] =>
    [...new Set([...(given ?? []), ...defaults])]

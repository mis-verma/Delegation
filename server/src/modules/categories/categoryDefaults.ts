import { and, asc, eq } from "drizzle-orm"
import { db } from "../../config/db.js"
import { categories, categoryAssignees, users } from "../../db/schema/core.js"
import { categoryTags } from "../../db/schema/ticket.js"

export type CategoryDefaults = {
    found: boolean
    isActive: boolean
    priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null
    tagIds: string[]
    departmentId: string | null
    tatHours: number | null
    assigneeId: string | null
}

const NONE: CategoryDefaults = { found: false, isActive: false, priority: null, tagIds: [], departmentId: null, tatHours: null, assigneeId: null }

export const categoryDefaults = async (categoryId: string | null | undefined): Promise<CategoryDefaults> => {
    if (!categoryId) return NONE
    const [row] = await db.select({ priority: categories.priority, departmentId: categories.departmentId, tatHours: categories.tatHours, isActive: categories.isActive })
        .from(categories).where(eq(categories.id, categoryId)).limit(1)
    if (!row) return NONE
    const [links, people] = await Promise.all([
        db.select({ tagId: categoryTags.tagId }).from(categoryTags).where(eq(categoryTags.categoryId, categoryId)),
        db.select({ userId: categoryAssignees.userId }).from(categoryAssignees)
            .innerJoin(users, eq(users.id, categoryAssignees.userId))
            .where(and(eq(categoryAssignees.categoryId, categoryId), eq(users.isActive, true), eq(users.departmentId, row.departmentId)))
            .orderBy(asc(categoryAssignees.createdAt), asc(categoryAssignees.id))
            .limit(1),
    ])
    return {
        found: true,
        isActive: row.isActive,
        priority: row.priority ?? null,
        tagIds: links.map((link) => link.tagId),
        departmentId: row.departmentId,
        tatHours: row.tatHours ?? null,
        assigneeId: people[0]?.userId ?? null,
    }
}

export const mergeTagIds = (given: readonly string[] | undefined, defaults: readonly string[]): string[] =>
    [...new Set([...(given ?? []), ...defaults])]

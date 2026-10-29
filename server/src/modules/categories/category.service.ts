import { db } from "../../config/db.js";
import { categories, categoryAssignees, departments, users } from "../../db/schema/core.js";
import { categoryTags } from "../../db/schema/ticket.js";
import { tags } from "../../db/schema/task.js";
import type { Executor } from "../tickets/ticketShared.js";
import { eq, asc, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { CreateCategoryInput, UpdateCategoryInput } from "./category.validation.js";
import { auditService } from "../audit/audit.service.js";
import { cached, invalidate, cacheKey } from "../../config/queryCache.js";

const CACHE_PREFIX = "lookup:Category";
const CACHE_TTL_SECONDS = 300;
const dropCache = () => invalidate(CACHE_PREFIX);

type CategoryRow = typeof categories.$inferSelect;

const syncCategoryTags = async (executor: Executor, categoryId: string, tagIds: string[]) => {
    await executor.delete(categoryTags).where(eq(categoryTags.categoryId, categoryId));
    const unique = [...new Set(tagIds)];
    if (!unique.length) return;
    const existing = await executor.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique));
    if (!existing.length) return;
    await executor.insert(categoryTags).values(existing.map((tag) => ({ categoryId, tagId: tag.id })));
};

const attachRelations = async (rows: CategoryRow[]) => {
    if (rows.length === 0) return [];

    const departmentIds = [...new Set(rows.map((r) => r.departmentId))];
    const departmentRows = departmentIds.length
        ? await db.select({ id: departments.id, name: departments.name }).from(departments).where(inArray(departments.id, departmentIds))
        : [];
    const departmentById = new Map(departmentRows.map((d) => [d.id, d]));

    const categoryIds = rows.map((r) => r.id);
    const assigneeRows = await db.select({
        categoryId: categoryAssignees.categoryId,
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
    })
        .from(categoryAssignees)
        .innerJoin(users, eq(categoryAssignees.userId, users.id))
        .where(inArray(categoryAssignees.categoryId, categoryIds));

    const tagRows = await db.select({ categoryId: categoryTags.categoryId, id: tags.id, name: tags.name, color: tags.color })
        .from(categoryTags)
        .innerJoin(tags, eq(categoryTags.tagId, tags.id))
        .where(inArray(categoryTags.categoryId, categoryIds))
        .orderBy(asc(tags.name));
    const tagsByCategory = new Map<string, { id: string; name: string; color: string | null }[]>();
    for (const { categoryId, ...tag } of tagRows) {
        const list = tagsByCategory.get(categoryId) ?? [];
        list.push(tag);
        tagsByCategory.set(categoryId, list);
    }

    const assigneesByCategory = new Map<string, typeof assigneeRows>();
    for (const row of assigneeRows) {
        const { categoryId } = row;
        const list = assigneesByCategory.get(categoryId) ?? [];
        list.push(row);
        assigneesByCategory.set(categoryId, list);
    }

    return rows.map((row) => {
        const assignees = (assigneesByCategory.get(row.id) ?? []).map(({ categoryId, ...user }) => user);
        return {
            ...row,
            department: departmentById.get(row.departmentId) ?? null,
            assigneeIds: assignees.map((u) => u.id),
            assignees,
            tags: tagsByCategory.get(row.id) ?? [],
            tagIds: (tagsByCategory.get(row.id) ?? []).map((tag) => tag.id),
        };
    });
};

const getByIdOrThrow = async (id: string) => {
    const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!category) throw AppError.notFound("Category not found");
    const [mapped] = await attachRelations([category]);
    if (!mapped) throw AppError.notFound("Category not found");
    return mapped;
};

export const categoryService = {
    async list() {
        return cached(cacheKey(CACHE_PREFIX, "all"), CACHE_TTL_SECONDS, async () => {
            const rows = await db.select().from(categories).orderBy(asc(categories.name));
            return attachRelations(rows);
        });
    },

    async getById(id: string) {
        return getByIdOrThrow(id);
    },

    async create(input: CreateCategoryInput, actorId: string) {
        const [existing] = await db.select({ id: categories.id }).from(categories).where(eq(categories.name, input.name)).limit(1);
        if (existing) throw AppError.conflict("Name is already exists");

        const id = createId();
        await db.transaction(async (tx) => {
            await tx.insert(categories).values({
                id,
                name: input.name,
                departmentId: input.departmentId,
                tatHours: input.tatHours ?? null,
                priority: input.priority ?? null,
                isActive: input.isActive ?? true,
            });

            if (input.assigneeIds?.length) {
                const uniqueAssigneeIds = [...new Set(input.assigneeIds)];
                await tx.insert(categoryAssignees).values(
                    uniqueAssigneeIds.map((userId) => ({ categoryId: id, userId })),
                );
            }

            if (input.tagIds?.length) await syncCategoryTags(tx, id, input.tagIds);
        });

        const created = await getByIdOrThrow(id);
        await auditService.record({ entityType: "Category", entityId: id, action: "CREATE", actorId, after: created });
        await dropCache();
        return created;
    },

    async update(id: string, input: UpdateCategoryInput, actorId: string) {
        const before = await getByIdOrThrow(id);

        const { assigneeIds, tagIds, ...rest } = input;

        await db.transaction(async (tx) => {
            await tx.update(categories).set({ ...rest, updatedAt: new Date() }).where(eq(categories.id, id));

            if (assigneeIds !== undefined) {
                await tx.delete(categoryAssignees).where(eq(categoryAssignees.categoryId, id));
                if (assigneeIds.length) {
                    const uniqueAssigneeIds = [...new Set(assigneeIds)];
                    await tx.insert(categoryAssignees).values(
                        uniqueAssigneeIds.map((userId) => ({ categoryId: id, userId })),
                    );
                }
            }

            if (tagIds !== undefined) await syncCategoryTags(tx, id, tagIds);
        });

        const after = await getByIdOrThrow(id);
        await auditService.record({ entityType: "Category", entityId: id, action: "UPDATE", actorId, before, after });
        await dropCache();
        return after;
    },

    async remove(id: string, actorId: string) {
        const category = await getByIdOrThrow(id);
        await db.delete(categories).where(eq(categories.id, id));
        await auditService.record({ entityType: "Category", entityId: id, action: "DELETE", actorId, before: category });
        await dropCache();
        return category;
    }
};

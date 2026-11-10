import { db } from "../../config/db.js";
import { categories, categoryAssignees, categorySubcategories, departments, users } from "../../db/schema/core.js";
import { categorySubcategoryTags, categoryTags, tickets } from "../../db/schema/ticket.js";
import { tags } from "../../db/schema/task.js";
import type { Executor } from "../tickets/ticketShared.js";
import { eq, and, ne, asc, inArray, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import type { CreateCategoryInput, UpdateCategoryInput, CreateSubcategoryInput, UpdateSubcategoryInput } from "./category.validation.js";
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

const syncSubcategoryTags = async (executor: Executor, subcategoryId: string, tagIds: string[]) => {
    await executor.delete(categorySubcategoryTags).where(eq(categorySubcategoryTags.subcategoryId, subcategoryId));
    const unique = [...new Set(tagIds)];
    if (!unique.length) return;
    const existing = await executor.select({ id: tags.id }).from(tags).where(inArray(tags.id, unique));
    if (!existing.length) return;
    await executor.insert(categorySubcategoryTags).values(existing.map((tag) => ({ subcategoryId, tagId: tag.id })));
};

type SubcategoryRow = typeof categorySubcategories.$inferSelect;

const attachSubcategoryTags = async (rows: SubcategoryRow[]) => {
    if (!rows.length) return [];
    const links = await db.select({ subcategoryId: categorySubcategoryTags.subcategoryId, id: tags.id, name: tags.name, color: tags.color })
        .from(categorySubcategoryTags)
        .innerJoin(tags, eq(categorySubcategoryTags.tagId, tags.id))
        .where(inArray(categorySubcategoryTags.subcategoryId, rows.map((r) => r.id)))
        .orderBy(asc(tags.name));
    const bySub = new Map<string, { id: string; name: string; color: string | null }[]>();
    for (const { subcategoryId, ...tag } of links) {
        const list = bySub.get(subcategoryId) ?? [];
        list.push(tag);
        bySub.set(subcategoryId, list);
    }
    return rows.map((row) => ({ ...row, tags: bySub.get(row.id) ?? [], tagIds: (bySub.get(row.id) ?? []).map((tag) => tag.id) }));
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

    const subcategoryRows = await db.select().from(categorySubcategories)
        .where(inArray(categorySubcategories.categoryId, categoryIds))
        .orderBy(asc(categorySubcategories.sortOrder), asc(categorySubcategories.name));
    const subcategoriesWithTags = await attachSubcategoryTags(subcategoryRows);
    const subcategoriesByCategory = new Map<string, typeof subcategoriesWithTags>();
    for (const row of subcategoriesWithTags) {
        const list = subcategoriesByCategory.get(row.categoryId) ?? [];
        list.push(row);
        subcategoriesByCategory.set(row.categoryId, list);
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
            subcategories: subcategoriesByCategory.get(row.id) ?? [],
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

const getSubcategoryOrThrow = async (categoryId: string, id: string) => {
    const [row] = await db.select().from(categorySubcategories)
        .where(and(eq(categorySubcategories.id, id), eq(categorySubcategories.categoryId, categoryId))).limit(1);
    if (!row) throw AppError.notFound("Subcategory not found");
    const [withTags] = await attachSubcategoryTags([row]);
    return withTags!;
};

const assertAssignee = async (assigneeId: string | null | undefined) => {
    if (!assigneeId) return;
    const [person] = await db.select({ id: users.id, isActive: users.isActive }).from(users).where(eq(users.id, assigneeId)).limit(1);
    if (!person || !person.isActive) throw AppError.badRequest("Pick an active person for this subcategory.");
};

const assertSubcategoryNameFree = async (categoryId: string, name: string, exceptId?: string) => {
    const conditions = [eq(categorySubcategories.categoryId, categoryId), eq(categorySubcategories.name, name)];
    if (exceptId) conditions.push(ne(categorySubcategories.id, exceptId));
    const [clash] = await db.select({ id: categorySubcategories.id }).from(categorySubcategories).where(and(...conditions)).limit(1);
    if (clash) throw AppError.conflict(`"${name}" is already a subcategory of this category.`);
};

export const categoryService = {
    async createSubcategory(categoryId: string, input: CreateSubcategoryInput, actorId: string) {
        await getByIdOrThrow(categoryId);
        await assertSubcategoryNameFree(categoryId, input.name);
        await assertAssignee(input.assigneeId);
        const id = createId();
        const [last] = await db.select({ top: sql<number>`COALESCE(MAX(${categorySubcategories.sortOrder}), -1)` })
            .from(categorySubcategories).where(eq(categorySubcategories.categoryId, categoryId));
        await db.transaction(async (tx) => {
            await tx.insert(categorySubcategories).values({
                id,
                categoryId,
                name: input.name,
                priority: input.priority ?? null,
                tatHours: input.tatHours ?? null,
                assigneeId: input.assigneeId ?? null,
                isActive: input.isActive ?? true,
                sortOrder: input.sortOrder ?? Number(last?.top ?? -1) + 1,
            });
            if (input.tagIds?.length) await syncSubcategoryTags(tx, id, input.tagIds);
        });
        const created = await getSubcategoryOrThrow(categoryId, id);
        await auditService.record({ entityType: "CategorySubcategory", entityId: id, action: "CREATE", actorId, after: created });
        await dropCache();
        return created;
    },

    async updateSubcategory(categoryId: string, id: string, input: UpdateSubcategoryInput, actorId: string) {
        const before = await getSubcategoryOrThrow(categoryId, id);
        if (input.name !== undefined && input.name !== before.name) await assertSubcategoryNameFree(categoryId, input.name, id);
        if (input.assigneeId !== undefined) await assertAssignee(input.assigneeId);
        const { tagIds, ...fields } = input;
        await db.transaction(async (tx) => {
            await tx.update(categorySubcategories).set({ ...fields, updatedAt: new Date() }).where(eq(categorySubcategories.id, id));
            if (tagIds !== undefined) await syncSubcategoryTags(tx, id, tagIds);
        });
        const after = await getSubcategoryOrThrow(categoryId, id);
        await auditService.record({ entityType: "CategorySubcategory", entityId: id, action: "UPDATE", actorId, before, after });
        await dropCache();
        return after;
    },

    async removeSubcategory(categoryId: string, id: string, actorId: string) {
        const row = await getSubcategoryOrThrow(categoryId, id);
        const [filed] = await db.select({ count: sql<number>`count(*)` }).from(tickets).where(eq(tickets.subcategoryId, id));
        const count = Number(filed?.count ?? 0);
        if (count > 0) {
            throw AppError.conflict(`${count} ${count === 1 ? "ticket was" : "tickets were"} filed under "${row.name}", so it can't be deleted. Turn it off instead and it stops showing on new tickets.`);
        }
        await db.delete(categorySubcategories).where(eq(categorySubcategories.id, id));
        await auditService.record({ entityType: "CategorySubcategory", entityId: id, action: "DELETE", actorId, before: row });
        await dropCache();
        return row;
    },

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
        const [filed] = await db.select({ count: sql<number>`count(*)` }).from(tickets).where(eq(tickets.categoryId, id));
        const count = Number(filed?.count ?? 0);
        if (count > 0) {
            throw AppError.conflict(`${count} ${count === 1 ? "ticket was" : "tickets were"} filed under "${category.name}", so it can't be deleted. Turn it off instead and it stops showing on new tickets.`);
        }
        await db.delete(categories).where(eq(categories.id, id));
        await auditService.record({ entityType: "Category", entityId: id, action: "DELETE", actorId, before: category });
        await dropCache();
        return category;
    }
};

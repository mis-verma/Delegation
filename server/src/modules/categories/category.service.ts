import { db } from "../../config/db.js";
import { categories, categoryAssignees, departments, users } from "../../db/schema/core.js";
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

    const assigneesByCategory = new Map<string, typeof assigneeRows>();
    for (const row of assigneeRows) {
        const { categoryId, ...user } = row;
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
        };
    });
};

const getByIdOrThrow = async (id: string) => {
    const [category] = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    if (!category) throw AppError.notFound("Category not found");
    const [mapped] = await attachRelations([category]);
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
                isActive: input.isActive ?? true,
            });

            if (input.assigneeIds?.length) {
                const uniqueAssigneeIds = [...new Set(input.assigneeIds)];
                await tx.insert(categoryAssignees).values(
                    uniqueAssigneeIds.map((userId) => ({ categoryId: id, userId })),
                );
            }
        });

        const created = await getByIdOrThrow(id);
        await auditService.record({ entityType: "Category", entityId: id, action: "CREATE", actorId, after: created });
        await dropCache();
        return created;
    },

    async update(id: string, input: UpdateCategoryInput, actorId: string) {
        const before = await getByIdOrThrow(id);

        const { assigneeIds, ...rest } = input;

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

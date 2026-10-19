import { db } from "../../config/db.js";
import { projects, projectMembers, users } from "../../db/schema/core.js";
import { eq, or, inArray, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js"
import type { AccessTokenPayload } from "../../middleware/auth/auth.js"
import type { CreateProjectInput, UpdateProjectInput } from "./project.validation.js"
import { auditService } from "../audit/audit.service.js";

type ProjectRow = typeof projects.$inferSelect;

const assertMembersExist = async (memberIds: string[]) => {
    if (!memberIds.length) return;
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, memberIds));
    const foundIds = new Set(found.map((u) => u.id));
    const missing = memberIds.filter((id) => !foundIds.has(id));
    if (missing.length) throw AppError.badRequest(`Unknown member id(s): ${missing.join(", ")}`);
};

const attachMemberIds = async (rows: ProjectRow[]) => {
    if (rows.length === 0) return [];
    const projectIds = rows.map((r) => r.id);
    const memberRows = await db.select({ projectId: projectMembers.projectId, userId: projectMembers.userId })
        .from(projectMembers)
        .where(inArray(projectMembers.projectId, projectIds));

    const memberIdsByProject = new Map<string, string[]>();
    for (const row of memberRows) {
        const list = memberIdsByProject.get(row.projectId) ?? [];
        list.push(row.userId);
        memberIdsByProject.set(row.projectId, list);
    }

    return rows.map((row) => ({ ...row, memberIds: memberIdsByProject.get(row.id) ?? [] }));
};

const getRawById = async (id: string) => {
    const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
    return project;
};

const visibilityCondition = async (user: AccessTokenPayload) => {
    if (user.role === "ADMIN" || user.role === "PC") return undefined;

    const memberOf = await db.select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, user.sub));
    const memberProjectIds = memberOf.map((row) => row.projectId);

    return memberProjectIds.length
        ? or(eq(projects.ownerId, user.sub), inArray(projects.id, memberProjectIds))
        : eq(projects.ownerId, user.sub);
};

const MAX_PROJECTS_PER_LIST = 500;

export const projectService = {
    async list(user: AccessTokenPayload) {
        const condition = await visibilityCondition(user);
        const query = db.select().from(projects).orderBy(desc(projects.createdAt)).limit(MAX_PROJECTS_PER_LIST);
        const rows = condition ? await query.where(condition) : await query;
        return attachMemberIds(rows);
    },

    async getById(id: string, user: AccessTokenPayload) {
        const project = await getRawById(id);
        if (!project) throw AppError.notFound("Project not found");

        const [mapped] = await attachMemberIds([project]);
        const isMember = mapped.memberIds.includes(user.sub);
        if (user.role !== "ADMIN" && user.role !== "PC" && project.ownerId !== user.sub && !isMember) {
            throw AppError.notFound("Project not found");
        }

        return mapped;
    },

    async create(input: CreateProjectInput, user: AccessTokenPayload) {
        const id = createId();
        if (input.memberIds?.length) await assertMembersExist([...new Set(input.memberIds)]);
        await db.transaction(async (tx) => {
            await tx.insert(projects).values({
                id,
                name: input.name,
                description: input.description ?? '',
                ownerId: user.sub,
            });

            if (input.memberIds?.length) {
                const uniqueMemberIds = [...new Set(input.memberIds)];
                await tx.insert(projectMembers).values(
                    uniqueMemberIds.map((userId) => ({ projectId: id, userId })),
                );
            }
        });

        const project = await getRawById(id);
        const [mapped] = await attachMemberIds([project!]);
        await auditService.record({ entityType: "Project", entityId: id, action: "CREATE", actorId: user.sub, after: mapped });
        return mapped;
    },

    async update(id: string, input: UpdateProjectInput, user: AccessTokenPayload) {
        const project = await getRawById(id);
        if (!project) throw AppError.notFound("Project not found");
        if (user.role !== "ADMIN" && user.role !== "PC" && project.ownerId !== user.sub) {
            throw AppError.forbidden("Only the project owner can update this project")
        }
        const [before] = await attachMemberIds([project]);

        const { memberIds, ...rest } = input;
        if (memberIds?.length) await assertMembersExist([...new Set(memberIds)]);

        await db.transaction(async (tx) => {
            await tx.update(projects).set({ ...rest, updatedAt: new Date() }).where(eq(projects.id, id));

            if (memberIds !== undefined) {
                await tx.delete(projectMembers).where(eq(projectMembers.projectId, id));
                if (memberIds.length) {
                    const uniqueMemberIds = [...new Set(memberIds)];
                    await tx.insert(projectMembers).values(
                        uniqueMemberIds.map((userId) => ({ projectId: id, userId })),
                    );
                }
            }
        });

        const updated = await getRawById(id);
        const [mapped] = await attachMemberIds([updated!]);
        await auditService.record({ entityType: "Project", entityId: id, action: "UPDATE", actorId: user.sub, before, after: mapped });
        return mapped;
    },

    async remove(id: string, user: AccessTokenPayload) {
        const project = await getRawById(id);
        if (!project) throw AppError.notFound("Project not found");
        if (user.role !== "ADMIN" && user.role !== "PC" && project.ownerId !== user.sub) {
            throw AppError.forbidden("Only the project owner can delete this project")
        }
        const [mapped] = await attachMemberIds([project]);
        await db.delete(projects).where(eq(projects.id, id));
        await auditService.record({ entityType: "Project", entityId: id, action: "DELETE", actorId: user.sub, before: mapped });
        return mapped
    }
}

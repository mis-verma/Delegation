import { db } from "../../config/db.js"; // Drizzle client — replaces the old Mongoose Project model
import { projects, projectMembers, users } from "../../db/schema/core.js"; // Project table + its memberIds junction table
import { eq, or, inArray, desc } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js" // consistent error helper (404, 403, etc.)
import type { AccessTokenPayload } from "../../middleware/auth/auth.js" // decoded JWT info: who's calling, and their role
import type { CreateProjectInput, UpdateProjectInput } from "./project.validation.js" // typed input shapes from the zod schemas
import { auditService } from "../audit/audit.service.js";

type ProjectRow = typeof projects.$inferSelect;

// Pre-checks memberIds against `users` before create/update insert them into ProjectMember —
// without this, an invalid/nonexistent id wasn't rejected until the insert hit the FK constraint,
// surfacing only as a generic "Referenced record does not exist" 400 from the global error handler
// instead of a field-specific validation error naming which id was bad.
const assertMembersExist = async (memberIds: string[]) => {
    if (!memberIds.length) return;
    const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, memberIds));
    const foundIds = new Set(found.map((u) => u.id));
    const missing = memberIds.filter((id) => !foundIds.has(id));
    if (missing.length) throw AppError.badRequest(`Unknown member id(s): ${missing.join(", ")}`);
};

// NOTE: the conventions doc suggests Drizzle's relational query API (`db.query.x.findMany({
// with: ... })`) for populate-style reads. That generates LATERAL-join SQL which this
// environment's actual database (MariaDB 10.11, not real MySQL) rejects with a syntax error
// (`ER_PARSE_ERROR` near the lateral derived table) — confirmed by hand against the local DB.
// So Project.memberIds (formerly a Mongoose array field, now the ProjectMember junction table)
// is fetched with a manual join/inArray query below instead of `with`.
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

// Builds the Drizzle `where` condition for "which projects can this user see":
// admins/PC see everything (no condition — PC has full parity with ADMIN throughout this app),
// everyone else only sees projects where they are the owner OR listed as a member (via the
// ProjectMember junction table).
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
    // list all projects visible to this user, newest first
    async list(user: AccessTokenPayload) {
        const condition = await visibilityCondition(user);
        // Newest first with a ceiling, so an org with a very long project history can't return all of it.
        const query = db.select().from(projects).orderBy(desc(projects.createdAt)).limit(MAX_PROJECTS_PER_LIST);
        const rows = condition ? await query.where(condition) : await query;
        return attachMemberIds(rows);
    },

    // fetch one project by id, only if the user is allowed to see it
    async getById(id: string, user: AccessTokenPayload) {
        const project = await getRawById(id);
        if (!project) throw AppError.notFound("Project not found");

        const [mapped] = await attachMemberIds([project]);
        const isMember = mapped.memberIds.includes(user.sub);
        if (user.role !== "ADMIN" && user.role !== "PC" && project.ownerId !== user.sub && !isMember) {
            // Same as the original Mongoose query filter silently returning nothing for a
            // project this user can't see — don't leak whether the id exists at all.
            throw AppError.notFound("Project not found");
        }

        return mapped;
    },

    // create a new project; the creator automatically becomes the owner
    async create(input: CreateProjectInput, user: AccessTokenPayload) {
        const id = createId();
        if (input.memberIds?.length) await assertMembersExist([...new Set(input.memberIds)]);
        // Wrapped in a transaction (source had none) — the project row and its member junction
        // rows must succeed or fail together.
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

    // update an existing project - this is where the Task/Project relationship's "ownership" rules matter:
    // only the project's owner (or an admin) is allowed to change it
    async update(id: string, input: UpdateProjectInput, user: AccessTokenPayload) {
        const project = await getRawById(id);
        if (!project) throw AppError.notFound("Project not found");
        if (user.role !== "ADMIN" && user.role !== "PC" && project.ownerId !== user.sub) {
            // if you're not an admin/PC and you're not the owner, you're not allowed to update this project
            throw AppError.forbidden("Only the project owner can update this project")
        }
        const [before] = await attachMemberIds([project]);

        const { memberIds, ...rest } = input;
        if (memberIds?.length) await assertMembersExist([...new Set(memberIds)]);

        // Wrapped in a transaction (source had none) — see create() above.
        await db.transaction(async (tx) => {
            await tx.update(projects).set({ ...rest, updatedAt: new Date() }).where(eq(projects.id, id));

            // Many-to-many replace-the-whole-array: delete-all-and-reinsert (no other table's FK
            // points at ProjectMember rows), only touched when memberIds was part of this update.
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

    // delete a project - same "must be owner or admin" rule as update
    async remove(id: string, user: AccessTokenPayload) {
        const project = await getRawById(id);
        if (!project) throw AppError.notFound("Project not found");
        if (user.role !== "ADMIN" && user.role !== "PC" && project.ownerId !== user.sub) {
            throw AppError.forbidden("Only the project owner can delete this project")
        }
        const [mapped] = await attachMemberIds([project]);
        // ProjectMember.projectId has onDelete: 'cascade', so junction rows are removed
        // automatically along with the project row.
        await db.delete(projects).where(eq(projects.id, id));
        await auditService.record({ entityType: "Project", entityId: id, action: "DELETE", actorId: user.sub, before: mapped });
        return mapped
        // note: the project is returned here *after* being deleted from the DB - the in-memory object is still valid to read from, it's just no longer in the DB
    }
}

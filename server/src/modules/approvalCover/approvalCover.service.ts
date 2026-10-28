import { and, asc, count, eq, gte, inArray, isNull, lte, or } from "drizzle-orm"
import { alias } from "drizzle-orm/mysql-core"
import { createId } from "@paralleldrive/cuid2"
import { db } from "../../config/db.js"
import { users, type Role } from "../../db/schema/core.js"
import { approvalCovers } from "../../db/schema/approvalCover.js"
import { AppError } from "../../utils/AppError.js"
import { auditService } from "../audit/audit.service.js"
import { COVER_ELIGIBLE_ROLES, MAX_ACTIVE_COVERS_GIVEN, isCoverEligibleRole, validateCoverWindow } from "./approvalCoverRules.js"
import type { CreateApprovalCoverInput } from "./approvalCover.validation.js"

export type CoverApprover = { id: string; role: Role; departmentId: string | null; storeId: string | null }

type Actor = { sub: string; role: Role }

const fromUsers = alias(users, "coverFromUsers")
const toUsers = alias(users, "coverToUsers")

const fullName = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ""}`.trim()

export const approvalCoverService = {
    async activeCoversFor(toUserId: string, now: Date = new Date()): Promise<CoverApprover[]> {
        return db
            .select({ id: users.id, role: users.role, departmentId: users.departmentId, storeId: users.storeId })
            .from(approvalCovers)
            .innerJoin(users, eq(users.id, approvalCovers.fromUserId))
            .where(and(
                eq(approvalCovers.toUserId, toUserId),
                isNull(approvalCovers.revokedAt),
                lte(approvalCovers.startsAt, now),
                gte(approvalCovers.endsAt, now),
                eq(users.isActive, true),
            ))
    },

    async expandWithDelegates(userIds: string[], now: Date = new Date()): Promise<string[]> {
        if (userIds.length === 0) return userIds
        const rows = await db
            .select({ toUserId: approvalCovers.toUserId })
            .from(approvalCovers)
            .innerJoin(users, eq(users.id, approvalCovers.toUserId))
            .where(and(
                inArray(approvalCovers.fromUserId, userIds),
                isNull(approvalCovers.revokedAt),
                lte(approvalCovers.startsAt, now),
                gte(approvalCovers.endsAt, now),
                eq(users.isActive, true),
            ))
        return [...new Set([...userIds, ...rows.map((r) => r.toUserId)])]
    },

    async people(actor: Actor) {
        const rows = await db
            .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role, departmentId: users.departmentId })
            .from(users)
            .where(and(eq(users.isActive, true), inArray(users.role, [...COVER_ELIGIBLE_ROLES])))
            .orderBy(asc(users.firstName))
        return rows.filter((r) => r.id !== actor.sub).map((r) => ({ id: r.id, name: fullName(r), role: r.role, departmentId: r.departmentId }))
    },

    async listFor(userId: string) {
        const now = new Date()
        const base = {
            id: approvalCovers.id,
            fromUserId: approvalCovers.fromUserId,
            toUserId: approvalCovers.toUserId,
            startsAt: approvalCovers.startsAt,
            endsAt: approvalCovers.endsAt,
            note: approvalCovers.note,
            fromFirst: fromUsers.firstName,
            fromLast: fromUsers.lastName,
            fromRole: fromUsers.role,
            fromDepartmentId: fromUsers.departmentId,
            toFirst: toUsers.firstName,
            toLast: toUsers.lastName,
        }
        const rows = await db
            .select(base)
            .from(approvalCovers)
            .innerJoin(fromUsers, eq(fromUsers.id, approvalCovers.fromUserId))
            .innerJoin(toUsers, eq(toUsers.id, approvalCovers.toUserId))
            .where(and(
                isNull(approvalCovers.revokedAt),
                gte(approvalCovers.endsAt, now),
                or(eq(approvalCovers.fromUserId, userId), eq(approvalCovers.toUserId, userId)),
            ))
            .orderBy(asc(approvalCovers.endsAt))
        const shape = (r: (typeof rows)[number]) => ({
            id: r.id,
            fromUserId: r.fromUserId,
            toUserId: r.toUserId,
            fromName: fullName({ firstName: r.fromFirst, lastName: r.fromLast }),
            toName: fullName({ firstName: r.toFirst, lastName: r.toLast }),
            fromRole: r.fromRole,
            fromDepartmentId: r.fromDepartmentId,
            startsAt: r.startsAt,
            endsAt: r.endsAt,
            note: r.note,
            active: r.startsAt.getTime() <= now.getTime(),
        })
        return {
            given: rows.filter((r) => r.fromUserId === userId).map(shape),
            received: rows.filter((r) => r.toUserId === userId).map(shape),
        }
    },

    async create(input: CreateApprovalCoverInput, actor: Actor) {
        const fromUserId = input.fromUserId ?? actor.sub
        if (fromUserId !== actor.sub && actor.role !== "ADMIN") throw AppError.forbidden("Only an admin can set a cover for someone else.")
        if (!isCoverEligibleRole(actor.role)) throw AppError.forbidden("Only an approver can pass approvals to someone.")
        if (input.toUserId === fromUserId) throw AppError.badRequest("Pick someone other than yourself.")

        const [from] = await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, fromUserId)).limit(1)
        const [to] = await db.select({ id: users.id, role: users.role, isActive: users.isActive }).from(users).where(eq(users.id, input.toUserId)).limit(1)
        if (!from || !from.isActive || !isCoverEligibleRole(from.role)) throw AppError.badRequest("That person does not approve anything, so there is nothing to pass on.")
        if (!to || !to.isActive) throw AppError.badRequest("That person is not active.")
        if (!isCoverEligibleRole(to.role)) throw AppError.badRequest("Pick a department head, PC or Admin to cover approvals.")

        const now = new Date()
        const startsAt = input.startsAt ? new Date(input.startsAt) : now
        const endsAt = new Date(input.endsAt)
        const windowProblem = validateCoverWindow(startsAt, endsAt, now)
        if (windowProblem) throw AppError.badRequest(windowProblem)

        const [givenRow] = await db
            .select({ value: count() })
            .from(approvalCovers)
            .where(and(eq(approvalCovers.fromUserId, fromUserId), isNull(approvalCovers.revokedAt), gte(approvalCovers.endsAt, now)))
        const given = givenRow?.value ?? 0
        if (given >= MAX_ACTIVE_COVERS_GIVEN) throw AppError.conflict(`You already have ${MAX_ACTIVE_COVERS_GIVEN} covers set. Stop one first.`)

        const id = createId()
        await db.insert(approvalCovers).values({ id, fromUserId, toUserId: input.toUserId, startsAt, endsAt, note: input.note || null, createdBy: actor.sub })
        await auditService.record({
            entityType: "ApprovalCover", entityId: id, action: "CREATE", actorId: actor.sub,
            after: { fromUserId, toUserId: input.toUserId, startsAt, endsAt, note: input.note ?? null },
        })
        return { id }
    },

    async revoke(id: string, actor: Actor) {
        const [cover] = await db.select().from(approvalCovers).where(eq(approvalCovers.id, id)).limit(1)
        if (!cover || cover.revokedAt) throw AppError.notFound("That cover is not active.")
        const mayRevoke = actor.role === "ADMIN" || cover.fromUserId === actor.sub || cover.toUserId === actor.sub
        if (!mayRevoke) throw AppError.forbidden()
        const [result] = await db.update(approvalCovers).set({ revokedAt: new Date() }).where(and(eq(approvalCovers.id, id), isNull(approvalCovers.revokedAt)))
        if (result.affectedRows === 0) throw AppError.conflict("That cover was just stopped.")
        await auditService.record({
            entityType: "ApprovalCover", entityId: id, action: "REVOKE", actorId: actor.sub,
            before: { fromUserId: cover.fromUserId, toUserId: cover.toUserId, endsAt: cover.endsAt },
        })
    },
}

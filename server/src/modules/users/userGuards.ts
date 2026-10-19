import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users, refreshTokens, passwordResetTokens } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import type { DbTransaction } from "../audit/audit.service.js"

type Executor = typeof db | DbTransaction

export const LAST_ADMIN_MESSAGE = "This is the last active admin. Make someone else an admin first."

export const lockAdmins = async (tx: DbTransaction) =>
    tx.select({ id: users.id, isActive: users.isActive }).from(users).where(eq(users.role, "ADMIN")).for("update")

export const assertAnotherActiveAdmin = async (tx: DbTransaction, excludeIds: string[]) => {
    const admins = await lockAdmins(tx)
    if (!admins.some((a) => a.isActive && !excludeIds.includes(a.id))) throw AppError.badRequest(LAST_ADMIN_MESSAGE)
}

export const assertCanDeactivate = async (id: string, role: string, actorId: string, tx?: DbTransaction) => {
    if (id === actorId) throw AppError.badRequest("You can't deactivate your own account.")
    if (role !== "ADMIN") return
    if (tx) return assertAnotherActiveAdmin(tx, [id])
    const [others] = await db.select({ n: sql<number>`count(*)` }).from(users)
        .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true), sql`${users.id} <> ${id}`))
    if (!Number(others?.n ?? 0)) throw AppError.badRequest(LAST_ADMIN_MESSAGE)
}

export const revokeSessions = (id: string, exec: Executor = db) =>
    exec.update(refreshTokens)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)))

export const spendResetLinks = (id: string, exec: Executor = db) =>
    exec.update(passwordResetTokens)
        .set({ usedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, id), isNull(passwordResetTokens.usedAt)))

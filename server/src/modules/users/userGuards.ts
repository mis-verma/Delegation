import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { users, refreshTokens, passwordResetTokens } from "../../db/schema/core.js"
import { AppError } from "../../utils/AppError.js"
import type { DbTransaction } from "../audit/audit.service.js"

// Either the pool or an open transaction: the guards below run in both.
type Executor = typeof db | DbTransaction

export const LAST_ADMIN_MESSAGE = "This is the last active admin. Make someone else an admin first."

// Locks every ADMIN row (SELECT ... FOR UPDATE) and returns who is active among them. Taking the lock
// inside the same transaction as the change that follows is what stops two admins demoting or
// deactivating each other at the same moment and leaving nobody in charge.
export const lockAdmins = async (tx: DbTransaction) =>
    tx.select({ id: users.id, isActive: users.isActive }).from(users).where(eq(users.role, "ADMIN")).for("update")

// Throws unless an active ADMIN OTHER than every id in `excludeIds` exists. Pass the transaction so
// the check and the write that follows are one atomic step.
export const assertAnotherActiveAdmin = async (tx: DbTransaction, excludeIds: string[]) => {
    const admins = await lockAdmins(tx)
    if (!admins.some((a) => a.isActive && !excludeIds.includes(a.id))) throw AppError.badRequest(LAST_ADMIN_MESSAGE)
}

// Switching someone off must never lock the organisation out or let an admin do it to themselves.
// Shared by the plain PATCH and the offboarding flow. Pass `tx` to make the last-admin check part of
// the caller's transaction (recommended); without it the check runs on its own.
export const assertCanDeactivate = async (id: string, role: string, actorId: string, tx?: DbTransaction) => {
    if (id === actorId) throw AppError.badRequest("You can't deactivate your own account.")
    if (role !== "ADMIN") return
    if (tx) return assertAnotherActiveAdmin(tx, [id])
    const [others] = await db.select({ n: sql<number>`count(*)` }).from(users)
        .where(and(eq(users.role, "ADMIN"), eq(users.isActive, true), sql`${users.id} <> ${id}`))
    if (!Number(others?.n ?? 0)) throw AppError.badRequest(LAST_ADMIN_MESSAGE)
}

// Ends every session of a person who has been switched off, so a stolen or still-open login stops
// working immediately (the access token is re-checked against isActive on every request anyway).
export const revokeSessions = (id: string, exec: Executor = db) =>
    exec.update(refreshTokens)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)))

// Any reset link still outstanding for this account is spent once the password changes.
export const spendResetLinks = (id: string, exec: Executor = db) =>
    exec.update(passwordResetTokens)
        .set({ usedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, id), isNull(passwordResetTokens.usedAt)))

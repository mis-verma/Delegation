import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { users, refreshTokens, passwordResetTokens, notifications } from "../../db/schema/core.js";
import { eq, and, or, desc, asc, sql, isNull, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import { auditService } from "../audit/audit.service.js";
import { hashPassword, comparePassword, deriveDefaultRank } from "../../utils/password.js";
import { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { presenceService } from "../presence/presence.service.js";
import type { CreateUserInput, UpdateUserInput, UpdateOwnProfileInput } from "./user.validation.js";

// Drizzle wraps the driver's error: the MySQL code sits on `.cause`. 1451 = a row somewhere still
// points at this one (the delete is blocked by a foreign key).
const isReferencedError = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null;
    return e?.code === 'ER_ROW_IS_REFERENCED_2' || e?.cause?.code === 'ER_ROW_IS_REFERENCED_2';
};

// Switching someone off must never lock the organisation out or let an admin do it to themselves.
// Shared by the plain PATCH below and the offboarding flow.
export const assertCanDeactivate = async (id: string, role: string, actorId: string) => {
    if (id === actorId) throw AppError.badRequest("You can't deactivate your own account.");
    if (role !== 'ADMIN') return;
    const [others] = await db.select({ n: sql<number>`count(*)` }).from(users)
        .where(and(eq(users.role, 'ADMIN'), eq(users.isActive, true), sql`${users.id} <> ${id}`));
    if (!Number(others?.n ?? 0)) throw AppError.badRequest('This is the last active admin. Make someone else an admin first.');
};

// Ends every session of a person who has been switched off, so a stolen or still-open login stops
// working immediately (the access token is re-checked against isActive on every request anyway).
export const revokeSessions = (id: string) =>
    db.update(refreshTokens)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));

// An assertion function narrowing `T | undefined` (a plain row is now `undefined` when missing,
// not Mongoose's `null`) to `T`, throwing AppError.notFound otherwise.
function assertFound<T>(entity: T | undefined, message: string = 'User not found'): asserts entity is T {
    if (!entity) throw AppError.notFound(message);
}

// Explicit column list that NEVER includes passwordHash — every read in this service goes
// through this, per the conventions doc's warning that `db.select()` with no column list
// would otherwise leak the bcrypt hash to API responses.
const publicUserColumns = {
    id: users.id,
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
    role: users.role,
    gender: users.gender,
    departmentId: users.departmentId,
    storeId: users.storeId,
    isActive: users.isActive,
    rank: users.rank,
    phone: users.phone,
    avatarUrl: users.avatarUrl,
    weekOffDays: users.weekOffDays,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
};

const getSafeById = async (id: string) => {
    const [user] = await db.select(publicUserColumns).from(users).where(eq(users.id, id)).limit(1);
    return user;
};

export const userService = {
    // page/limit are optional — pass both to get a paginated slice (the admin directory list),
    // omit both to get the full roster unchanged (every other caller: OrgStructure's tree, etc.).
    async list(page?: number, limit?: number) {
        if (page && limit) {
            const [rows, totalRows] = await Promise.all([
                db.select(publicUserColumns).from(users).orderBy(desc(users.createdAt)).offset((page - 1) * limit).limit(limit),
                db.select({ count: sql<number>`count(*)` }).from(users),
            ]);
            const total = Number(totalRows[0]?.count ?? 0);
            return {
                data: rows,
                meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total },
            };
        }

        const data = await db.select(publicUserColumns).from(users).orderBy(desc(users.createdAt));
        return { data };
    },

    async getById(id: string) {
        const user = await getSafeById(id);
        assertFound(user);
        return user;
    },

    async create(input: CreateUserInput, actorId: string) {
        // Mongoose's schema-level `lowercase: true, trim: true` on email ran automatically on
        // save — replicate that normalization explicitly here (same as auth.service.ts register).
        const email = input.email.trim().toLowerCase();
        const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (existing) throw AppError.conflict('Email already registered');

        const passwordHash = await hashPassword(input.password);
        const rank = deriveDefaultRank(input.role);
        const id = createId();

        await db.insert(users).values({
            id,
            email,
            passwordHash,
            firstName: input.firstName,
            lastName: input.lastName,
            role: input.role,
            departmentId: input.departmentId ?? null,
            storeId: input.storeId ?? null,
            gender: input.gender ?? null,
            rank,
        });

        // Re-select (through the passwordHash-free column list) rather than constructing the
        // return value by hand, so `createdAt`/`updatedAt` DB defaults are reflected accurately.
        const user = await getSafeById(id);
        assertFound(user);

        await auditService.record({
            entityType: "User",
            entityId: user.id,
            action: "CREATE",
            actorId,
            after: { email: user.email, role: user.role, isActive: user.isActive }
        });

        return user;
    },

    async update(id: string, input: UpdateUserInput, actorId: string) {
        const before = await getSafeById(id);
        assertFound(before);

        // Password changes aren't handled through this endpoint (see user.validation.ts), so
        // there's no passwordHash to touch here — just the plain profile/admin-management fields.
        const { email, ...rest } = input;
        const normalizedEmail = email !== undefined ? email.trim().toLowerCase() : undefined;
        const deactivating = input.isActive === false && before.isActive;
        if (deactivating) await assertCanDeactivate(id, before.role, actorId);

        // Same pre-check create() does — without it, changing a user's email to one already in
        // use hits the DB's unique index instead, which throws a raw ER_DUP_ENTRY the caller sees
        // as a generic 500-ish error rather than a clean, expected 409.
        if (normalizedEmail !== undefined && normalizedEmail !== before.email) {
            const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
            if (existing) throw AppError.conflict('Email already registered');
        }

        await db.update(users)
            .set({
                ...rest,
                ...(normalizedEmail !== undefined ? { email: normalizedEmail } : {}),
                updatedAt: new Date(),
            })
            .where(eq(users.id, id));

        if (deactivating) await revokeSessions(id);

        const user = await getSafeById(id);
        assertFound(user);

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "UPDATE",
            actorId,
            before: { email: before.email, role: before.role, isActive: before.isActive, weekOffDays: before.weekOffDays },
            after: { email: user.email, role: user.role, isActive: user.isActive, weekOffDays: user.weekOffDays }
        });

        return user;
    },

    // A user editing their own profile — same shape of update as `update` above, just scoped to
    // the narrower set of fields updateOwnProfileSchema allows and always self-attributed (the
    // actor editing this record IS this record).
    async updateOwnProfile(id: string, input: UpdateOwnProfileInput) {
        const before = await getSafeById(id);
        assertFound(before);

        await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, id));

        const user = await getSafeById(id);
        assertFound(user);

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "UPDATE",
            actorId: id,
            before: { firstName: before.firstName, lastName: before.lastName, phone: before.phone, weekOffDays: before.weekOffDays },
            after: { firstName: user.firstName, lastName: user.lastName, phone: user.phone, weekOffDays: user.weekOffDays },
        });

        return user;
    },

    // A user changing their own password — has to prove they know the current one first, unlike
    // resetPassword above (an admin setting someone else's password directly with no such check).
    async changeOwnPassword(id: string, currentPassword: string, newPassword: string) {
        const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        assertFound(user, 'User not found');

        const valid = await comparePassword(currentPassword, user.passwordHash);
        if (!valid) throw AppError.badRequest('Current password is incorrect');

        const passwordHash = await hashPassword(newPassword);
        await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));

        // Same reasoning as the admin-initiated reset above: changing a password is exactly the
        // moment a stolen refresh token should stop working, so every existing session — this
        // one's included — is revoked. The client signs back in with the new password right after.
        await db.update(refreshTokens)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "PASSWORD_RESET",
            actorId: id,
            before: { email: user.email },
        });
    },

    // Real delete is only for an account with no history (one created by mistake). Anyone who has
    // worked in the system is referenced by tickets, tasks, checklists or audits, and removing them
    // would leave those records pointing at nobody, so they are deactivated instead (offboard in
    // userOffboarding.service.ts). Sessions, reset links and notifications are disposable and go with
    // the account; if anything real still points at the person the whole delete rolls back.
    async remove(id: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);
        if (id === actorId) throw AppError.badRequest("You can't delete your own account.");

        try {
            await db.transaction(async (tx) => {
                await tx.delete(refreshTokens).where(eq(refreshTokens.userId, id));
                await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
                await tx.delete(notifications).where(eq(notifications.recipientId, id));
                await tx.delete(users).where(eq(users.id, id));
            });
        } catch (err) {
            if (isReferencedError(err)) {
                throw AppError.conflict(
                    `${user.firstName} has records in the system (tickets, tasks, checklists or audits), so they can't be deleted. ` +
                    "Deactivate them instead: they keep their name on old records and can no longer log in.",
                );
            }
            throw err;
        }

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "DELETE",
            actorId,
            before: { email: user.email, role: user.role }
        });

        return user;
    },

    // Admin-initiated reset: an ADMIN/PC sets this user's password directly (e.g. they're locked
    // out), as opposed to auth.service.ts's self-service "email me a reset link" flow. Never logs
    // the new password itself - only the fact that a reset happened.
    async resetPassword(id: string, newPassword: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);

        const passwordHash = await hashPassword(newPassword);
        await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, id));

        // Same reasoning as the self-service reset: kick out any existing sessions, since this is
        // exactly the moment a stolen refresh token should stop working too.
        await db.update(refreshTokens)
            .set({ revokedAt: new Date(), updatedAt: new Date() })
            .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "PASSWORD_RESET",
            actorId,
            before: { email: user.email },
        });
    },

    // Replaces this user's profile picture. Best-effort deletes the previous file from disk (same
    // approach as taskImage.service.ts's remove()) so replacing a photo doesn't leave orphans.
    async setAvatar(id: string, url: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);

        if (user.avatarUrl) {
            const oldPath = path.resolve(process.cwd(), "uploads", "avatars", path.basename(user.avatarUrl));
            fs.unlink(oldPath, (err) => {
                if (err) console.error("Failed to delete old avatar file from disk:", err);
            });
        }

        await db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, id));

        const updated = await getSafeById(id);
        assertFound(updated);

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "UPDATE",
            actorId,
            before: { avatarUrl: user.avatarUrl },
            after: { avatarUrl: url },
        });

        return updated;
    },

    async removeAvatar(id: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);
        if (!user.avatarUrl) return user;

        const oldPath = path.resolve(process.cwd(), "uploads", "avatars", path.basename(user.avatarUrl));
        fs.unlink(oldPath, (err) => {
            if (err) console.error("Failed to delete avatar file from disk:", err);
        });

        await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, id));

        const updated = await getSafeById(id);
        assertFound(updated);

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "UPDATE",
            actorId,
            before: { avatarUrl: user.avatarUrl },
            after: { avatarUrl: null },
        });

        return updated;
    },


    async listAssignable(user: AccessTokenPayload, departmentId?: string, storeId?: string, storeIds?: string[]) {
        const isScoped = user.role !== "ADMIN" && user.role !== "PC";
        // Department heads (MANAGER/SENIOR/APPROVAL_MANAGER) send tickets and work to other
        // departments, so choosing a department must list THAT department's people, not silently
        // fall back to their own. Front-line roles (AGENT/USER) still never browse another
        // department. Only names and roles come back, same fields as before.
        const canBrowseDepartments = user.role === "MANAGER" || user.role === "SENIOR" || user.role === "APPROVAL_MANAGER";
        const effectiveDepartmentId = isScoped && !canBrowseDepartments && departmentId !== user.departmentId ? undefined : departmentId;
        const effectiveStoreId = isScoped && storeId !== user.storeId ? undefined : storeId
        // A checklist can target several stores at once, so the assignee picker needs "assignable
        // in ANY of these stores", not just the first one - a scoped caller (non-ADMIN/PC) can only
        // ever see their own store regardless of what the checklist's store list contains.
        const effectiveStoreIds = storeIds?.length
            ? (isScoped ? storeIds.filter((id) => id === user.storeId) : storeIds)
            : undefined

        const conditions = [eq(users.isActive, true)];
        if (effectiveDepartmentId) conditions.push(eq(users.departmentId, effectiveDepartmentId))
        if (effectiveStoreIds?.length) conditions.push(inArray(users.storeId, effectiveStoreIds))
        else if (effectiveStoreId) conditions.push(eq(users.storeId, effectiveStoreId))

        if (isScoped && !effectiveDepartmentId && !effectiveStoreId && !effectiveStoreIds?.length) {
            const onConditions = [eq(users.id, user.sub)];
            if (user.departmentId) onConditions.push(eq(users.departmentId, user.departmentId))
            if (user.storeId) onConditions.push(eq(users.storeId, user.storeId))

            conditions.push(or(...onConditions)!)
        }

        return db.select({
            id: users.id,
            firstName: users.firstName,
            lastName: users.lastName,
            email: users.email,
            role: users.role,
            departmentId: users.departmentId,
        })
            .from(users)
            .where(and(...conditions))
            .orderBy(asc(users.firstName));
    },

    // Who's online right now (Redis, live) plus when everyone was last seen (DB, durable) — the
    // two questions "who's active" actually needs, in one call so the client isn't stitching two
    // responses together itself.
    async presence() {
        const [rows, onlineIds] = await Promise.all([
            db.select({ id: users.id, lastActiveAt: users.lastActiveAt }).from(users),
            presenceService.getOnlineUserIds(),
        ]);

        return rows.map((r) => ({
            id: r.id,
            online: onlineIds.has(r.id),
            lastActiveAt: r.lastActiveAt,
        }));
    },
};

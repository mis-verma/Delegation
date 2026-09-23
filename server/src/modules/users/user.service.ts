import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { users, refreshTokens } from "../../db/schema/core.js";
import { eq, and, or, desc, asc, sql, isNull, inArray } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import { auditService } from "../audit/audit.service.js";
import { hashPassword, comparePassword, deriveDefaultRank } from "../../utils/password.js";
import { AccessTokenPayload } from "../../middleware/auth/auth.js";
import { presenceService } from "../presence/presence.service.js";
import type { CreateUserInput, UpdateUserInput, UpdateOwnProfileInput } from "./user.validation.js";

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
    departmentId: users.departmentId,
    storeId: users.storeId,
    isActive: users.isActive,
    rank: users.rank,
    phone: users.phone,
    avatarUrl: users.avatarUrl,
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

        const user = await getSafeById(id);
        assertFound(user);

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "UPDATE",
            actorId,
            before: { email: before.email, role: before.role, isActive: before.isActive },
            after: { email: user.email, role: user.role, isActive: user.isActive }
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
            before: { firstName: before.firstName, lastName: before.lastName, phone: before.phone },
            after: { firstName: user.firstName, lastName: user.lastName, phone: user.phone },
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

    async remove(id: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);

        await db.delete(users).where(eq(users.id, id));

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
        const effectiveDepartmentId = isScoped && departmentId !== user.departmentId ? undefined : departmentId;
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

import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { users, departments, stores, dressTypes, refreshTokens, passwordResetTokens, notifications } from "../../db/schema/core.js";
import { eq, and, or, desc, asc, sql, inArray, ne } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { AppError } from "../../utils/AppError.js";
import { auditService } from "../audit/audit.service.js";
import { hashPassword, comparePassword, deriveDefaultRank } from "../../utils/password.js";
import { AccessTokenPayload, passwordChangeStamp } from "../../middleware/auth/auth.js";
import { presenceService } from "../presence/presence.service.js";
import { disconnectUserSockets } from "../../sockets/socket.js";
import { invalidateAuthUsers } from "../../middleware/auth/authCache.js";
import type { CreateUserInput, UpdateUserInput, UpdateOwnProfileInput, BulkUpdateUsersInput } from "./user.validation.js";
import { assertPhoneAvailable } from "./phone.js";
import { mapDuplicateUserError } from "./dbErrors.js";
import {
    assertCanDeactivate,
    assertAnotherActiveAdmin,
    lockAdmins,
    revokeSessions,
    spendResetLinks,
    LAST_ADMIN_MESSAGE,
} from "./userGuards.js";
import { userOffboardingService } from "./userOffboarding.service.js";
import { refreshLiveChecklistsForUsers } from "./userChecklistSync.js";

export { assertCanDeactivate, revokeSessions };

const isReferencedError = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null;
    return e?.code === 'ER_ROW_IS_REFERENCED_2' || e?.cause?.code === 'ER_ROW_IS_REFERENCED_2';
};

function assertFound<T>(entity: T | undefined, message: string = 'User not found'): asserts entity is T {
    if (!entity) throw AppError.notFound(message);
}

const publicUserColumns = {
    id: users.id,
    email: users.email,
    firstName: users.firstName,
    lastName: users.lastName,
    role: users.role,
    gender: users.gender,
    dressTypeId: users.dressTypeId,
    reportsToId: users.reportsToId,
    departmentId: users.departmentId,
    storeId: users.storeId,
    isActive: users.isActive,
    rank: users.rank,
    phone: users.phone,
    avatarUrl: users.avatarUrl,
    weekOffDays: users.weekOffDays,
    deactivatedAt: users.deactivatedAt,
    mustChangePassword: users.mustChangePassword,
    createdAt: users.createdAt,
    updatedAt: users.updatedAt,
};

const getSafeById = async (id: string) => {
    const [user] = await db.select(publicUserColumns).from(users).where(eq(users.id, id)).limit(1);
    return user;
};

const userSnapshot = (u: {
    email: string; role: string; isActive: boolean; firstName: string; lastName: string | null; gender: string | null; dressTypeId: string | null; reportsToId?: string | null;
    phone: string | null; departmentId: string | null; storeId: string | null; weekOffDays: number[] | null; rank?: number | null;
}) => ({
    email: u.email,
    role: u.role,
    isActive: u.isActive,
    firstName: u.firstName,
    lastName: u.lastName,
    gender: u.gender,
    dressTypeId: u.dressTypeId,
    reportsToId: u.reportsToId ?? null,
    phone: u.phone,
    departmentId: u.departmentId,
    storeId: u.storeId,
    weekOffDays: u.weekOffDays,
    rank: u.rank ?? null,
});

const sameDays = (a: number[] | null | undefined, b: number[] | null | undefined) =>
    JSON.stringify([...(a ?? [])].sort()) === JSON.stringify([...(b ?? [])].sort());

const assertOrgRefs = async (departmentId?: string | null, storeId?: string | null, dressTypeId?: string | null) => {
    if (departmentId) {
        const [d] = await db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId)).limit(1);
        if (!d) throw AppError.badRequest("That department doesn't exist.");
    }
    if (storeId) {
        const [s] = await db.select({ id: stores.id }).from(stores).where(eq(stores.id, storeId)).limit(1);
        if (!s) throw AppError.badRequest("That store doesn't exist.");
    }
    if (dressTypeId) {
        const [t] = await db.select({ id: dressTypes.id }).from(dressTypes).where(eq(dressTypes.id, dressTypeId)).limit(1);
        if (!t) throw AppError.badRequest("That dress type doesn't exist.");
    }
};

const MAX_CHAIN_DEPTH = 25;
const assertReportsTo = async (userId: string | null, reportsToId: string | null | undefined) => {
    if (!reportsToId) return;
    if (userId && reportsToId === userId) throw AppError.badRequest("A person can't report to themself.");
    let cursor: string | null = reportsToId;
    for (let depth = 0; cursor && depth < MAX_CHAIN_DEPTH; depth += 1) {
        const [row] = await db.select({ id: users.id, isActive: users.isActive, reportsToId: users.reportsToId }).from(users).where(eq(users.id, cursor)).limit(1);
        if (!row) throw AppError.badRequest("That person doesn't exist.");
        if (depth === 0 && !row.isActive) throw AppError.badRequest("That person is deactivated, so they can't be someone's head.");
        if (userId && row.reportsToId === userId) throw AppError.badRequest("That would make a loop: that person already reports to this one, directly or through others.");
        cursor = row.reportsToId;
    }
};

const unlinkAvatarFile = (avatarUrl: string | null | undefined) => {
    if (!avatarUrl) return;
    const filePath = path.resolve(process.cwd(), "uploads", "avatars", path.basename(avatarUrl));
    fs.unlink(filePath, (err) => {
        if (err && err.code !== "ENOENT") console.error("Failed to delete avatar file from disk:", err);
    });
};

const applyPasswordChange = async (
    id: string,
    passwordHash: string,
    audit: { actorId: string; email: string },
    mustChangePassword = false,
) => {
    await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash, passwordChangedAt: passwordChangeStamp(), mustChangePassword, updatedAt: new Date() }).where(eq(users.id, id));
        await revokeSessions(id, tx);
        await spendResetLinks(id, tx);
        await auditService.recordInTx(tx, {
            entityType: "User",
            entityId: id,
            action: "PASSWORD_RESET",
            actorId: audit.actorId,
            before: { email: audit.email },
        });
    });
    await invalidateAuthUsers(id);
    disconnectUserSockets(id);
};

export const userService = {
    async list(page?: number, limit?: number) {
        if (page && limit) {
            const [rows, totalRows] = await Promise.all([
                db.select(publicUserColumns).from(users).orderBy(desc(users.createdAt), asc(users.id)).offset((page - 1) * limit).limit(limit),
                db.select({ count: sql<number>`count(*)` }).from(users),
            ]);
            const total = Number(totalRows[0]?.count ?? 0);
            return {
                data: rows,
                meta: { page, limit, total, totalPages: Math.ceil(total / limit), hasNext: page * limit < total },
            };
        }

        const data = await db.select(publicUserColumns).from(users).orderBy(desc(users.createdAt), asc(users.id));
        return { data };
    },

    async getById(id: string) {
        const user = await getSafeById(id);
        assertFound(user);
        return user;
    },

    async create(input: CreateUserInput, actorId: string) {
        const email = input.email.trim().toLowerCase();
        const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
        if (existing) throw AppError.conflict('Email already registered');
        await assertPhoneAvailable(input.phone);
        await assertOrgRefs(input.departmentId, input.storeId, input.dressTypeId);
        await assertReportsTo(null, input.reportsToId);

        const passwordHash = await hashPassword(input.password);
        const rank = deriveDefaultRank(input.role);
        const id = createId();

        try {
            await db.insert(users).values({
                id,
                email,
                passwordHash,
                mustChangePassword: true,
                firstName: input.firstName,
                lastName: input.lastName ?? null,
                role: input.role,
                departmentId: input.departmentId ?? null,
                storeId: input.storeId ?? null,
                gender: input.gender ?? null,
                dressTypeId: input.dressTypeId ?? null,
                reportsToId: input.reportsToId ?? null,
                phone: input.phone ?? null,
                weekOffDays: input.weekOffDays?.length ? input.weekOffDays : null,
                rank,
            });
        } catch (err) {
            throw mapDuplicateUserError(err);
        }

        const user = await getSafeById(id);
        assertFound(user);

        await auditService.record({
            entityType: "User",
            entityId: user.id,
            action: "CREATE",
            actorId,
            after: userSnapshot(user),
        });

        return user;
    },

    async update(id: string, input: UpdateUserInput, actorId: string) {
        const before = await getSafeById(id);
        assertFound(before);

        const newRole = input.role ?? before.role;
        const roleChanged = newRole !== before.role;
        if (roleChanged && id === actorId) throw AppError.badRequest("You can't change your own role.");

        const deactivating = input.isActive === false && before.isActive;
        const reactivating = input.isActive === true && !before.isActive;
        if (deactivating) {
            if (id === actorId) throw AppError.badRequest("You can't deactivate your own account.");
            const summary = await userOffboardingService.summary(id);
            if (summary.hasOpenWork) throw AppError.badRequest("Use Deactivate with hand-over: this person still has open work.");
        }

        const normalizedEmail = input.email !== undefined ? input.email.trim().toLowerCase() : undefined;
        if (normalizedEmail !== undefined && normalizedEmail !== before.email) {
            const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
            if (existing) throw AppError.conflict('Email already registered');
        }
        if (input.phone) await assertPhoneAvailable(input.phone, id);
        await assertOrgRefs(input.departmentId, input.storeId, input.dressTypeId);
        if (input.reportsToId !== undefined) await assertReportsTo(id, input.reportsToId);

        const set: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
        if (normalizedEmail !== undefined) set.email = normalizedEmail;
        if (input.firstName !== undefined) set.firstName = input.firstName;
        if (input.lastName !== undefined) set.lastName = input.lastName;
        if (input.gender !== undefined) set.gender = input.gender;
        if (input.dressTypeId !== undefined) set.dressTypeId = input.dressTypeId;
        if (input.reportsToId !== undefined) set.reportsToId = input.reportsToId;
        if (input.departmentId !== undefined) set.departmentId = input.departmentId;
        if (input.storeId !== undefined) set.storeId = input.storeId;
        if (input.weekOffDays !== undefined) set.weekOffDays = input.weekOffDays;
        if (input.phone !== undefined) set.phone = input.phone;
        if (input.isActive !== undefined) set.isActive = input.isActive;
        if (roleChanged) {
            set.role = newRole;
            set.rank = deriveDefaultRank(newRole, input.rank);
        } else if (input.rank !== undefined) {
            set.rank = input.rank;
        }
        if (deactivating) set.deactivatedAt = new Date();
        if (reactivating) set.deactivatedAt = null;

        const sensitive = roleChanged || deactivating || reactivating;
        const leavesAdmin = before.role === 'ADMIN' && before.isActive && roleChanged;

        let user: Awaited<ReturnType<typeof getSafeById>>;
        try {
            user = await db.transaction(async (tx) => {
                if (leavesAdmin) await assertAnotherActiveAdmin(tx, [id]);
                if (deactivating) await assertCanDeactivate(id, before.role, actorId, tx);

                await tx.update(users).set(set).where(eq(users.id, id));
                if (deactivating) await revokeSessions(id, tx);

                const [updated] = await tx.select(publicUserColumns).from(users).where(eq(users.id, id)).limit(1);
                assertFound(updated);
                if (sensitive) {
                    await auditService.recordInTx(tx, {
                        entityType: "User", entityId: id, action: "UPDATE", actorId,
                        before: userSnapshot(before), after: userSnapshot(updated),
                    });
                }
                return updated;
            });
        } catch (err) {
            throw mapDuplicateUserError(err);
        }
        assertFound(user);
        await invalidateAuthUsers(id);

        if (!sensitive) {
            await auditService.record({
                entityType: "User", entityId: id, action: "UPDATE", actorId,
                before: userSnapshot(before), after: userSnapshot(user),
            });
        }

        if (roleChanged || user.departmentId !== before.departmentId || user.storeId !== before.storeId || user.isActive !== before.isActive) {
            disconnectUserSockets(id);
        }

        if (!sameDays(user.weekOffDays, before.weekOffDays) || user.departmentId !== before.departmentId || user.storeId !== before.storeId) {
            await refreshLiveChecklistsForUsers([id], `updating ${id}`);
        }

        return user;
    },

    async bulkUpdate(input: BulkUpdateUsersInput, actorId: string) {
        const { ids, departmentId, storeId, role } = input;
        await assertOrgRefs(departmentId, storeId);

        const { changed, orgChanged } = await db.transaction(async (tx) => {
            const rows = await tx.select(publicUserColumns).from(users).where(inArray(users.id, ids)).for("update");
            if (rows.length !== ids.length) throw AppError.notFound("Some of the selected people no longer exist. Refresh the list and try again.");

            if (role !== undefined) {
                const me = rows.find((r) => r.id === actorId);
                if (me && me.role !== role) throw AppError.badRequest("You can't change your own role.");
                if (role !== "ADMIN" && rows.some((r) => r.role === "ADMIN" && r.isActive)) {
                    const admins = await lockAdmins(tx);
                    if (!admins.some((a) => a.isActive && !ids.includes(a.id))) throw AppError.badRequest(LAST_ADMIN_MESSAGE);
                }
            }

            const changed: string[] = [];
            const orgChanged: string[] = [];
            for (const before of rows) {
                const set: Partial<typeof users.$inferInsert> = {};
                if (departmentId !== undefined && departmentId !== before.departmentId) set.departmentId = departmentId;
                if (storeId !== undefined && storeId !== before.storeId) set.storeId = storeId;
                if (role !== undefined && role !== before.role) {
                    set.role = role;
                    set.rank = deriveDefaultRank(role);
                }
                if (!Object.keys(set).length) continue;
                set.updatedAt = new Date();

                await tx.update(users).set(set).where(eq(users.id, before.id));
                const after = { ...before, ...set } as typeof before;
                await auditService.recordInTx(tx, {
                    entityType: "User", entityId: before.id, action: "UPDATE", actorId,
                    before: userSnapshot(before), after: userSnapshot(after),
                });
                changed.push(before.id);
                if (set.departmentId !== undefined || set.storeId !== undefined) orgChanged.push(before.id);
            }
            return { changed, orgChanged };
        });

        await invalidateAuthUsers(...changed);
        for (const id of changed) disconnectUserSockets(id);
        await refreshLiveChecklistsForUsers(orgChanged, "a bulk move");

        return { updated: changed.length };
    },

    async updateOwnProfile(id: string, input: UpdateOwnProfileInput) {
        const before = await getSafeById(id);
        assertFound(before);

        if (input.phone) await assertPhoneAvailable(input.phone, id);

        try {
            await db.update(users).set({ ...input, updatedAt: new Date() }).where(eq(users.id, id));
        } catch (err) {
            throw mapDuplicateUserError(err);
        }

        const user = await getSafeById(id);
        assertFound(user);

        await auditService.record({
            entityType: "User",
            entityId: id,
            action: "UPDATE",
            actorId: id,
            before: userSnapshot(before),
            after: userSnapshot(user),
        });

        if (!sameDays(user.weekOffDays, before.weekOffDays)) {
            await refreshLiveChecklistsForUsers([id], `${id} changing their week off`);
        }

        return user;
    },

    async changeOwnPassword(id: string, currentPassword: string, newPassword: string) {
        const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        assertFound(user, 'User not found');

        const valid = await comparePassword(currentPassword, user.passwordHash);
        if (!valid) throw AppError.badRequest('Current password is incorrect');

        await applyPasswordChange(id, await hashPassword(newPassword), { actorId: id, email: user.email }, false);
    },

    async remove(id: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);
        if (id === actorId) throw AppError.badRequest("You can't delete your own account.");

        try {
            await db.transaction(async (tx) => {
                if (user.role === 'ADMIN' && user.isActive) await assertAnotherActiveAdmin(tx, [id]);

                await tx.delete(refreshTokens).where(eq(refreshTokens.userId, id));
                await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, id));
                await tx.delete(notifications).where(eq(notifications.recipientId, id));
                await tx.delete(users).where(eq(users.id, id));

                await auditService.recordInTx(tx, {
                    entityType: "User",
                    entityId: id,
                    action: "DELETE",
                    actorId,
                    before: userSnapshot(user),
                });
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

        unlinkAvatarFile(user.avatarUrl);
        disconnectUserSockets(id);

        return user;
    },

    async resetPassword(id: string, newPassword: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);

        await applyPasswordChange(id, await hashPassword(newPassword), { actorId, email: user.email }, true);
    },

    async setAvatar(id: string, url: string, actorId: string) {
        const user = await getSafeById(id);
        if (!user) {
            unlinkAvatarFile(url);
            throw AppError.notFound('User not found');
        }

        try {
            await db.update(users).set({ avatarUrl: url, updatedAt: new Date() }).where(eq(users.id, id));
        } catch (err) {
            unlinkAvatarFile(url);
            throw err;
        }
        if (user.avatarUrl && user.avatarUrl !== url) unlinkAvatarFile(user.avatarUrl);

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

        await db.update(users).set({ avatarUrl: null, updatedAt: new Date() }).where(eq(users.id, id));
        unlinkAvatarFile(user.avatarUrl);

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
        const effectiveDepartmentId = departmentId
        const effectiveStoreId = isScoped && storeId !== user.storeId ? undefined : storeId
        const effectiveStoreIds = storeIds?.length
            ? (isScoped ? storeIds.filter((id) => id === user.storeId) : storeIds)
            : undefined

        const conditions = [eq(users.isActive, true), ne(users.role, "OWNER")];
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
            .orderBy(asc(users.firstName), asc(users.lastName), asc(users.id));
    },

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

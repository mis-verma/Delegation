import path from "node:path";
import fs from "node:fs";
import { db } from "../../config/db.js";
import { users, departments, stores, dressTypes, refreshTokens, passwordResetTokens, notifications } from "../../db/schema/core.js";
import { eq, and, or, desc, asc, sql, inArray } from "drizzle-orm";
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

// The offboarding flow imports these from here, so they stay exported from this module.
export { assertCanDeactivate, revokeSessions };

// Drizzle wraps the driver's error: the MySQL code sits on `.cause`. 1451 = a row somewhere still
// points at this one (the delete is blocked by a foreign key).
const isReferencedError = (err: unknown) => {
    const e = err as { code?: string; cause?: { code?: string } } | null;
    return e?.code === 'ER_ROW_IS_REFERENCED_2' || e?.cause?.code === 'ER_ROW_IS_REFERENCED_2';
};

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

// What an audit row records about a person. Never includes the password hash.
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

// A department or store id that doesn't exist would otherwise surface as a raw foreign-key error.
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

// "Reports to": the person has to exist and be active, cannot be the user themself, and cannot sit
// below the user in the chain (A reports to B reports to A is a loop, and a loop would send an alert
// round in circles). `userId` is null while creating, when there is no chain below the new person yet.
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

// Best-effort removal of an avatar file from /uploads/avatars. Always called AFTER the database
// change that stops referencing it has succeeded, so a failed update never loses the picture.
const unlinkAvatarFile = (avatarUrl: string | null | undefined) => {
    if (!avatarUrl) return;
    const filePath = path.resolve(process.cwd(), "uploads", "avatars", path.basename(avatarUrl));
    fs.unlink(filePath, (err) => {
        if (err && err.code !== "ENOENT") console.error("Failed to delete avatar file from disk:", err);
    });
};

// The one place a password changes (own change and admin reset): new hash + the moment of change
// (which kills still-live access tokens), every session ended, outstanding reset links spent, and
// the audit row, all in ONE transaction. If the audit write fails, the password does not change.
const applyPasswordChange = async (
    id: string,
    passwordHash: string,
    audit: { actorId: string; email: string },
    // true when an admin set the password: the person must pick their own before using the app.
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
    // page/limit are optional — pass both to get a paginated slice (the admin directory list),
    // omit both to get the full roster unchanged (every other caller: OrgStructure's tree, etc.).
    async list(page?: number, limit?: number) {
        // id as a tiebreaker: rows created in the same second would otherwise swap places between
        // pages and show up twice or not at all.
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
        // The schema already trims and lowercases the email; this keeps the service safe for
        // callers that bypass it.
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
                // Admin-set starting password: temporary, replaced by the person at their first sign-in.
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
            // Two creates racing for the same email/phone: the unique index wins, the loser gets a clean 409.
            throw mapDuplicateUserError(err);
        }

        // Re-select (through the passwordHash-free column list) rather than constructing the
        // return value by hand, so `createdAt`/`updatedAt` DB defaults are reflected accurately.
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
        // Changing your own role could strip your own admin rights (or grant yourself more).
        if (roleChanged && id === actorId) throw AppError.badRequest("You can't change your own role.");

        const deactivating = input.isActive === false && before.isActive;
        const reactivating = input.isActive === true && !before.isActive;
        if (deactivating) {
            // Quick fail for the obvious cases; the last-admin check is repeated inside the transaction.
            if (id === actorId) throw AppError.badRequest("You can't deactivate your own account.");
            // A plain switch-off would orphan open tickets, tasks, checklists and categories. That
            // takes the hand-over flow (POST /users/:id/offboard), which moves the work first.
            const summary = await userOffboardingService.summary(id);
            if (summary.hasOpenWork) throw AppError.badRequest("Use Deactivate with hand-over: this person still has open work.");
        }

        const normalizedEmail = input.email !== undefined ? input.email.trim().toLowerCase() : undefined;
        // Same pre-check create() does — without it, changing a user's email to one already in
        // use hits the DB's unique index instead, which throws a raw ER_DUP_ENTRY the caller sees
        // as a generic 500-ish error rather than a clean, expected 409.
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
            // A new role means the old role's default rank no longer fits, unless one was given.
            set.rank = deriveDefaultRank(newRole, input.rank);
        } else if (input.rank !== undefined) {
            set.rank = input.rank;
        }
        if (deactivating) set.deactivatedAt = new Date();
        if (reactivating) set.deactivatedAt = null;

        // Role, activation and deactivation changes are the ones that must never happen without a
        // trail, so their audit row is written in the same transaction and a failure rolls it back.
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
        // authenticate() caches role/active/department/store for a short while; drop it now so a
        // demotion or deactivation applies on the very next request.
        await invalidateAuthUsers(id);

        if (!sensitive) {
            await auditService.record({
                entityType: "User", entityId: id, action: "UPDATE", actorId,
                before: userSnapshot(before), after: userSnapshot(user),
            });
        }

        // Anything that changes what a live socket may see (rooms are built from role, department
        // and store) or whether the person may be connected at all drops their sockets now.
        if (roleChanged || user.departmentId !== before.departmentId || user.storeId !== before.storeId || user.isActive !== before.isActive) {
            disconnectUserSockets(id);
        }

        // Week-off days, department and store decide who gets which of today's checklist runs.
        if (!sameDays(user.weekOffDays, before.weekOffDays) || user.departmentId !== before.departmentId || user.storeId !== before.storeId) {
            await refreshLiveChecklistsForUsers([id], `updating ${id}`);
        }

        return user;
    },

    // Moves many people at once (department, store and/or role). One transaction, the same guards
    // as update() (own role, last admin, rank recompute), one audit row per person who changed.
    async bulkUpdate(input: BulkUpdateUsersInput, actorId: string) {
        const { ids, departmentId, storeId, role } = input;
        await assertOrgRefs(departmentId, storeId);

        const { changed, orgChanged } = await db.transaction(async (tx) => {
            const rows = await tx.select(publicUserColumns).from(users).where(inArray(users.id, ids)).for("update");
            if (rows.length !== ids.length) throw AppError.notFound("Some of the selected people no longer exist. Refresh the list and try again.");

            if (role !== undefined) {
                const me = rows.find((r) => r.id === actorId);
                if (me && me.role !== role) throw AppError.badRequest("You can't change your own role.");
                // Every active admin in the selection is being demoted: someone outside it must stay.
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

    // A user editing their own profile — same shape of update as `update` above, just scoped to
    // the narrower set of fields updateOwnProfileSchema allows and always self-attributed (the
    // actor editing this record IS this record).
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

    // A user changing their own password — has to prove they know the current one first, unlike
    // resetPassword below (an admin setting someone else's password directly with no such check).
    async changeOwnPassword(id: string, currentPassword: string, newPassword: string) {
        const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
        assertFound(user, 'User not found');

        const valid = await comparePassword(currentPassword, user.passwordHash);
        if (!valid) throw AppError.badRequest('Current password is incorrect');

        // Changing a password is exactly the moment a stolen refresh token should stop working, so
        // every existing session — this one's included — ends. The client signs back in right after.
        await applyPasswordChange(id, await hashPassword(newPassword), { actorId: id, email: user.email }, false);
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
                // Deleting an active admin counts as taking an admin away.
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

        // Only after the delete has committed: the picture is no longer referenced by anyone.
        unlinkAvatarFile(user.avatarUrl);
        disconnectUserSockets(id);

        return user;
    },

    // Admin-initiated reset: an ADMIN/PC sets this user's password directly (e.g. they're locked
    // out), as opposed to auth.service.ts's self-service "email me a reset link" flow. Never logs
    // the new password itself - only the fact that a reset happened.
    async resetPassword(id: string, newPassword: string, actorId: string) {
        const user = await getSafeById(id);
        assertFound(user);

        // The admin chose or generated this password, so it is temporary: the person has to replace it at
        // their next sign-in and no admin ever holds anyone's real password.
        await applyPasswordChange(id, await hashPassword(newPassword), { actorId, email: user.email }, true);
    },

    // Replaces this user's profile picture. The previous file is deleted only after the database
    // points at the new one, so a failed update never leaves the user with no picture at all.
    async setAvatar(id: string, url: string, actorId: string) {
        const user = await getSafeById(id);
        if (!user) {
            // The upload is already on disk; nobody references it, so drop it.
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
        // Choosing a department lists THAT department's people for every role, so a ticket or
        // delegation raised for another department can name who should take it (front-line staff
        // used to be silently handed their own department's list instead). Only names and roles come
        // back for non-admins (the controller drops email). Without a department, a scoped caller
        // still only gets their own department, store and themselves, below.
        const effectiveDepartmentId = departmentId
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

        // The controller drops `email` for callers who are not ADMIN/PC; internal callers (the bulk
        // importers match people by email) still get it from here.
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

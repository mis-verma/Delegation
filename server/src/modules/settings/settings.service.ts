import { db } from "../../config/db.js"
import { settings } from "../../db/schema/core.js"
import { tickets, tasks } from "../../db/schema/index.js"
import { and, eq, isNull } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import type { UpdateSettingsInput } from "./settings.validation.js"
import { env } from "../../config/env.js"
import { auditService } from "../audit/audit.service.js";
import { verifyLoginCode } from "../../middleware/auth/loginCode.service.js";
import { assertLoginCodeChangeAllowed, turningLoginCodeOn } from "./loginCodeGuard.js";
import path from "node:path";
import fs from "node:fs";

let cache: typeof settings.$inferSelect | null = null;

const REFRESH_INTERVAL_MS = 30_000;

const restartAutoCloseClock = async () => {
    const now = new Date();
    await db.update(tickets).set({ autoCloseFrom: now }).where(and(eq(tickets.status, "PENDING_APPROVAL"), isNull(tickets.deletedAt)));
    await db.update(tasks).set({ autoCloseFrom: now }).where(and(eq(tasks.status, "pending_approval"), isNull(tasks.deletedAt)));
};

const loadOrCreate = async () => {
    const [existing] = await db.select().from(settings).limit(1);
    if (existing) return existing;

    const id = createId();
    await db.insert(settings).values({ id });
    const [created] = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
    return created!;
};

export const settingsService = {
    async init() {
        cache = await loadOrCreate();
        setInterval(() => {
            db.select().from(settings).limit(1)
                .then(([row]) => { if (row) cache = row; })
                .catch((err) => console.error("Settings background refresh failed:", err));
        }, REFRESH_INTERVAL_MS).unref();
        return cache;
    },

    getCached() {
        if (!cache) throw new Error("Settings accessed before settingsService.init() ran");
        return cache;
    },

    async get() {
        if (!cache) await this.init();
        return cache;
    },

    async update(input: UpdateSettingsInput, actorId: string) {
        if (!cache) await this.init();
        const { loginCodeProof, ...fields } = input;
        assertLoginCodeChangeAllowed(input, cache!, !!env.SMTP_HOST);
        if (turningLoginCodeOn(input, cache!)) await verifyLoginCode(actorId, loginCodeProof!);
        const id = cache!.id;
        const before = cache!;
        await db.update(settings).set({ ...fields, updatedAt: new Date() }).where(eq(settings.id, id));
        const [updated] = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
        cache = updated!;
        if (before.autoCloseDays === 0 && cache.autoCloseDays > 0) await restartAutoCloseClock();
        await auditService.record({ entityType: "Settings", entityId: id, action: "UPDATE", actorId, before, after: cache });
        return cache;
    },

    async updateLogo(url: string, actorId: string) {
        if (!cache) await this.init();
        const id = cache!.id;
        const before = cache!;

        if (before.logoUrl) {
            const oldPath = path.resolve(process.cwd(), "uploads", "logos", path.basename(before.logoUrl));
            fs.unlink(oldPath, (err) => {
                if (err) console.error("Failed to delete old logo file from disk:", err);
            });
        }

        await db.update(settings).set({ logoUrl: url, updatedAt: new Date() }).where(eq(settings.id, id));
        const [updated] = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
        cache = updated!;
        await auditService.record({ entityType: "Settings", entityId: id, action: "UPDATE", actorId, before, after: cache });
        return cache;
    },

    async removeLogo(actorId: string) {
        if (!cache) await this.init();
        const id = cache!.id;
        const before = cache!;
        if (!before.logoUrl) return cache!;

        const oldPath = path.resolve(process.cwd(), "uploads", "logos", path.basename(before.logoUrl));
        fs.unlink(oldPath, (err) => {
            if (err) console.error("Failed to delete logo file from disk:", err);
        });

        await db.update(settings).set({ logoUrl: null, updatedAt: new Date() }).where(eq(settings.id, id));
        const [updated] = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
        cache = updated!;
        await auditService.record({ entityType: "Settings", entityId: id, action: "UPDATE", actorId, before, after: cache });
        return cache;
    },
};

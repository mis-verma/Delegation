import { db } from "../../config/db.js"
import { settings } from "../../db/schema/core.js"
import { eq } from "drizzle-orm"
import { createId } from "@paralleldrive/cuid2"
import type { UpdateSettingsInput } from "./settings.validation.js"
import { auditService } from "../audit/audit.service.js";

// In-memory cache of the single Settings row. Anything that needs settings synchronously
// (e.g. building a multer instance per upload request, see config/upload.ts) reads this cache
// instead of hitting the database on every request. Refreshed on init() and every update().
let cache: typeof settings.$inferSelect | null = null;

// getCached() must stay synchronous (see above), which rules out routing it through
// config/queryCache.ts's Redis cache — that's Promise-based. On a multi-worker/replica
// deployment, update() only refreshes the process that received the PATCH; every other process's
// `cache` was previously stale until its next restart. This periodic re-read bounds that staleness
// to REFRESH_INTERVAL_MS instead, without changing getCached()'s synchronous contract.
const REFRESH_INTERVAL_MS = 30_000;

// Settings is a "single row" config table with no natural unique business key, so there's no
// column to target a MySQL upsert (`onDuplicateKeyUpdate`) against. Simplest correct approach:
// try to select the one row, and if the table is empty, insert a single default row (with a
// client-generated cuid id, per convention) and re-select it.
const loadOrCreate = async () => {
    const [existing] = await db.select().from(settings).limit(1);
    if (existing) return existing;

    const id = createId();
    await db.insert(settings).values({ id });
    const [created] = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
    return created!;
};

export const settingsService = {
    // Called once at server startup (see server.ts) so the cache is populated before the app
    // starts accepting requests — everything downstream assumes getCached() always has a value.
    async init() {
        cache = await loadOrCreate();
        setInterval(() => {
            db.select().from(settings).limit(1)
                .then(([row]) => { if (row) cache = row; })
                .catch((err) => console.error("Settings background refresh failed:", err));
        }, REFRESH_INTERVAL_MS).unref();
        return cache;
    },

    // Synchronous read of whatever's currently cached. Used by code that can't await a DB call
    // mid-request, like upload.ts building multer's limits object fresh on every upload.
    getCached() {
        if (!cache) throw new Error("Settings accessed before settingsService.init() ran");
        return cache;
    },

    async get() {
        if (!cache) await this.init();
        return cache;
    },

    // NOTE (bug fix): the old Mongoose Settings model had a typo, `maxUploadFiltes`, so updates
    // sent as `maxUploadFiles` (the name the Zod schema here — and the React client — always
    // used) matched no schema path and were silently dropped by Mongoose. The Drizzle `settings`
    // table below is spelled correctly (`maxUploadFiles`), so this update now actually persists
    // that field — a real, previously-live bug fix, not just a straight port.
    async update(input: UpdateSettingsInput, actorId: string) {
        if (!cache) await this.init();
        const id = cache!.id;
        const before = cache!;
        await db.update(settings).set({ ...input, updatedAt: new Date() }).where(eq(settings.id, id));
        const [updated] = await db.select().from(settings).where(eq(settings.id, id)).limit(1);
        cache = updated!;
        // Worth recording even though it's a single row: these are app-wide switches (maintenance
        // mode, upload limits), so "who turned this on and when" is exactly the audit question.
        await auditService.record({ entityType: "Settings", entityId: id, action: "UPDATE", actorId, before, after: cache });
        return cache;
    },
};

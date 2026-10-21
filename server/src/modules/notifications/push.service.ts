import { createHash } from "node:crypto"
import webpush from "web-push"
import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { notificationPreferences, notifications, pushSubscriptions } from "../../db/schema/core.js"

export type PushSubscriptionInput = { endpoint: string; keys: { p256dh: string; auth: string } }
export type NotificationPrefs = { quietStart: string | null; quietEnd: string | null; morningDigest: boolean }
type PushRow = { recipientId: string; type: string; title: string; message: string; ticketId: string | null; taskId: string | null; checklistInstanceId: string | null }

const configured = !!env.VAPID_PUBLIC_KEY && !!env.VAPID_PRIVATE_KEY
if (configured) webpush.setVapidDetails(env.VAPID_SUBJECT || "mailto:admin@karyaos.in", env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY)

const hashEndpoint = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex")
const URGENT = /ESCALATION|OVERDUE|CRITICAL/
const HHMM = /^([01][0-9]|2[0-3]):[0-5][0-9]$/

const orgHHmm = (now: Date) => new Date(now.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(11, 16)

const inQuietHours = (prefs: Pick<NotificationPrefs, "quietStart" | "quietEnd"> | undefined, now: Date) => {
    if (!prefs?.quietStart || !prefs.quietEnd || prefs.quietStart === prefs.quietEnd) return false
    const t = orgHHmm(now)
    return prefs.quietStart < prefs.quietEnd ? t >= prefs.quietStart && t < prefs.quietEnd : t >= prefs.quietStart || t < prefs.quietEnd
}

const pathFor = (n: Pick<PushRow, "ticketId" | "taskId" | "checklistInstanceId">) => {
    if (n.ticketId) return `/tickets?open=${n.ticketId}`
    if (n.taskId) return `/tasks?open=${n.taskId}`
    if (n.checklistInstanceId) return `/checklists/${n.checklistInstanceId}`
    return "/"
}

const unreadCounts = async (userIds: string[]) => {
    if (!userIds.length) return new Map<string, number>()
    const rows = await db
        .select({ userId: notifications.recipientId, total: count() })
        .from(notifications)
        .where(and(inArray(notifications.recipientId, userIds), eq(notifications.isRead, false)))
        .groupBy(notifications.recipientId)
    return new Map(rows.map((r) => [r.userId, Number(r.total)]))
}

const sendOne = async (sub: typeof pushSubscriptions.$inferSelect, payload: Record<string, unknown>) => {
    try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 60 * 60 * 12, urgency: "normal" })
        await db.update(pushSubscriptions).set({ lastUsedAt: new Date() }).where(eq(pushSubscriptions.id, sub.id))
    } catch (err) {
        const status = (err as { statusCode?: number }).statusCode
        if (status === 404 || status === 410) await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id))
        else console.error("Push send failed", status ?? err)
    }
}

export const pushService = {
    isConfigured: () => configured,
    publicKey: () => (configured ? env.VAPID_PUBLIC_KEY : null),

    async subscribe(userId: string, input: PushSubscriptionInput, userAgent: string | undefined) {
        const values = {
            userId,
            endpointHash: hashEndpoint(input.endpoint),
            endpoint: input.endpoint,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            userAgent: userAgent?.slice(0, 255) ?? null,
        }
        await db.insert(pushSubscriptions).values(values).onDuplicateKeyUpdate({ set: { userId, p256dh: values.p256dh, auth: values.auth, userAgent: values.userAgent } })
    },

    async unsubscribe(userId: string, endpoint: string) {
        await db.delete(pushSubscriptions).where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpointHash, hashEndpoint(endpoint))))
    },

    async deviceCount(userId: string) {
        const [row] = await db.select({ total: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
        return Number(row?.total ?? 0)
    },

    async getPreferences(userId: string): Promise<NotificationPrefs> {
        const [row] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)).limit(1)
        return { quietStart: row?.quietStart ?? null, quietEnd: row?.quietEnd ?? null, morningDigest: row?.morningDigest ?? false }
    },

    async savePreferences(userId: string, prefs: NotificationPrefs) {
        const quiet = prefs.quietStart && prefs.quietEnd && HHMM.test(prefs.quietStart) && HHMM.test(prefs.quietEnd)
        const values = { quietStart: quiet ? prefs.quietStart : null, quietEnd: quiet ? prefs.quietEnd : null, morningDigest: prefs.morningDigest, updatedAt: new Date() }
        await db.insert(notificationPreferences).values({ userId, ...values }).onDuplicateKeyUpdate({ set: values })
        return this.getPreferences(userId)
    },

    async deliver(rows: PushRow[]) {
        if (!configured || !rows.length) return
        const userIds = [...new Set(rows.map((r) => r.recipientId))]
        const [subs, prefs, unread] = await Promise.all([
            db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, userIds)),
            db.select().from(notificationPreferences).where(inArray(notificationPreferences.userId, userIds)),
            unreadCounts(userIds),
        ])
        if (!subs.length) return
        const prefsOf = new Map(prefs.map((p) => [p.userId, p]))
        const now = new Date()
        const jobs: Promise<void>[] = []
        for (const row of rows) {
            if (!URGENT.test(row.type) && inQuietHours(prefsOf.get(row.recipientId), now)) continue
            const payload = { title: row.title, body: row.message.slice(0, 180), url: pathFor(row), tag: `n-${row.type}-${row.ticketId ?? row.taskId ?? row.checklistInstanceId ?? row.recipientId}`, urgent: URGENT.test(row.type), badge: unread.get(row.recipientId) ?? 1 }
            for (const sub of subs.filter((s) => s.userId === row.recipientId)) jobs.push(sendOne(sub, payload))
        }
        await Promise.all(jobs)
    },

    async sendMorningDigest(now = new Date()) {
        if (!configured) return 0
        const today = new Date(now.getTime() + env.CHECKLIST_TIMEZONE_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10)
        const wanted = await db.select().from(notificationPreferences).where(eq(notificationPreferences.morningDigest, true))
        const due = wanted.filter((p) => p.lastDigestOn !== today)
        if (!due.length) return 0
        const ids = due.map((p) => p.userId)
        const [subs, unread] = await Promise.all([
            db.select().from(pushSubscriptions).where(inArray(pushSubscriptions.userId, ids)),
            unreadCounts(ids),
        ])
        let sent = 0
        for (const p of due) {
            const mine = subs.filter((s) => s.userId === p.userId)
            const n = unread.get(p.userId) ?? 0
            await db.update(notificationPreferences).set({ lastDigestOn: today }).where(eq(notificationPreferences.userId, p.userId))
            if (!mine.length || n === 0) continue
            const payload = { title: "Good morning", body: `${n} ${n === 1 ? "update is" : "updates are"} waiting for you in KaryaOS.`, url: "/", tag: "morning-digest", badge: n }
            await Promise.all(mine.map((s) => sendOne(s, payload)))
            sent++
        }
        return sent
    },
}

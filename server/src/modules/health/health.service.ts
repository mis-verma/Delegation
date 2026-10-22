import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { count, eq, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { env } from "../../config/env.js"
import { jobRuns, pushSubscriptions, users } from "../../db/schema/core.js"
import { pushService } from "../notifications/push.service.js"
import { offsiteConfigured } from "../../utils/dataBackup.js"
import { queryCacheStatus } from "../../config/queryCache.js"
import { registeredJobs } from "../../utils/jobTracker.js"
import { recentServerErrors } from "./errorBuffer.js"
import { responseSection } from "./requestStats.js"
import { readSyncStatus } from "../../utils/uploadsSync.js"
import { approvalsSection, diskSection, growthSection, uploadsSection, QUEUE_WARN_HOURS } from "./risk.service.js"

type Level = "ok" | "warn" | "down"

const DAY_MS = 86_400_000
const processStartedAt = new Date(Date.now() - process.uptime() * 1000)

type JobStatus = "ok" | "late" | "failing" | "waiting"

const databaseSection = async () => {
    const started = Date.now()
    try {
        await db.execute(sql`SELECT 1`)
        const latencyMs = Date.now() - started

        const [versionRows] = await db.execute(sql`SELECT VERSION() AS version`) as unknown as [{ version: string }[]]
        const [tableRows] = await db.execute(sql`
            SELECT TABLE_NAME AS name, TABLE_ROWS AS tableRows,
                   ROUND((DATA_LENGTH + INDEX_LENGTH) / 1048576, 1) AS sizeMb
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
        `) as unknown as [{ name: string; tableRows: number | string | null; sizeMb: number | string }[]]
        const tables = tableRows.map((t) => ({ name: t.name, rows: Number(t.tableRows ?? 0), sizeMb: Number(t.sizeMb ?? 0) }))

        let migrations: number | null = null
        try {
            const [rows] = await db.execute(sql`SELECT COUNT(*) AS n FROM __drizzle_migrations`) as unknown as [{ n: number | string }[]]
            migrations = Number(rows[0]?.n ?? 0)
        } catch {
        }

        const level: Level = latencyMs > 500 ? "warn" : "ok"
        return {
            level,
            latencyMs,
            version: versionRows[0]?.version ?? null,
            migrations,
            totalSizeMb: Math.round(tables.reduce((sum, t) => sum + t.sizeMb, 0) * 10) / 10,
            tableCount: tables.length,
            biggestTables: tables.slice(0, 8),
        }
    } catch (err) {
        return {
            level: "down" as Level,
            latencyMs: null,
            version: null,
            migrations: null,
            totalSizeMb: 0,
            tableCount: 0,
            biggestTables: [],
            error: String((err as Error)?.message ?? err).slice(0, 200),
        }
    }
}

const jobsSection = async () => {
    const registered = registeredJobs()
    let rows: (typeof jobRuns.$inferSelect)[] = []
    try {
        rows = await db.select().from(jobRuns)
    } catch (err) {
        console.error("Health: could not read job heartbeats", err)
    }
    const byName = new Map(rows.map((r) => [r.name, r]))
    const now = Date.now()

    return registered.map((job) => {
        const row = byName.get(job.name)
        let status: JobStatus = "waiting"
        if (row) {
            const lateAfterMs = (job.everyMinutes * 2.5 + 5) * 60_000
            if (row.lastStatus === "FAILED") status = "failing"
            else if (now - row.lastFinishedAt.getTime() > lateAfterMs) status = "late"
            else status = "ok"
        }
        return {
            name: job.name,
            schedule: job.expression,
            everyMinutes: job.everyMinutes,
            status,
            lastRunAt: row?.lastFinishedAt ?? null,
            lastDurationMs: row?.lastDurationMs ?? null,
            lastError: row?.lastStatus === "FAILED" ? row.lastError : null,
            runs: row?.runCount ?? 0,
            failures: row?.failCount ?? 0,
        }
    }).sort((a, b) => a.name.localeCompare(b.name))
}

const MAX_LISTED = 200

const alertsSection = async () => {
    const configured = pushService.isConfigured()
    try {
        const [people, subscriptions] = await Promise.all([
            db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName, role: users.role }).from(users).where(eq(users.isActive, true)),
            db.select({ userId: pushSubscriptions.userId, devices: count() }).from(pushSubscriptions).groupBy(pushSubscriptions.userId),
        ])
        const devicesByUser = new Map(subscriptions.map((s) => [s.userId, Number(s.devices)]))
        const without = people
            .filter((p) => !devicesByUser.has(p.id))
            .map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName ?? ""}`.trim(), role: p.role as string }))
            .sort((a, b) => a.name.localeCompare(b.name))
        const withAlerts = people.length - without.length
        const rate = people.length ? withAlerts / people.length : 0
        const level: Level = !configured ? "warn" : rate < 0.5 ? "warn" : "ok"
        return {
            level,
            configured,
            activeUsers: people.length,
            withAlerts,
            devices: [...devicesByUser.values()].reduce((sum, n) => sum + n, 0),
            withoutAlerts: without.slice(0, MAX_LISTED),
            withoutCount: without.length,
        }
    } catch (err) {
        console.error("Health: could not read alert adoption", err)
        return { level: "warn" as Level, configured, activeUsers: 0, withAlerts: 0, devices: 0, withoutAlerts: [], withoutCount: 0 }
    }
}

const backupsSection = async () => {
    const dir = join(process.cwd(), "backups")
    try {
        const names = await readdir(dir)
        const stamped = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(join(dir, name))).mtime })))
        stamped.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
        const latest = stamped[0] ?? null
        const ageDays = latest ? Math.floor((Date.now() - latest.mtime.getTime()) / DAY_MS) : null
        const level: Level = latest && ageDays !== null && ageDays <= 2 ? "ok" : "warn"
        return { level, count: stamped.length, latestName: latest?.name ?? null, latestAt: latest?.mtime ?? null, ageDays, offsite: offsiteConfigured() }
    } catch {
        return { level: "warn" as Level, count: 0, latestName: null, latestAt: null, ageDays: null, offsite: offsiteConfigured() }
    }
}

export const healthService = {
    async snapshot() {
        const [database, jobs, backups, alerts, disk, growth, approvals, responses, photoSync] = await Promise.all([databaseSection(), jobsSection(), backupsSection(), alertsSection(), diskSection(), growthSection(), approvalsSection(), responseSection(), readSyncStatus()])
        const uploads = uploadsSection()
        const cache = queryCacheStatus()
        const errors = recentServerErrors()
        const recentErrorCount = errors.filter((e) => Date.now() - Date.parse(e.at) < DAY_MS).length
        const jobsBad = jobs.filter((j) => j.status === "failing" || j.status === "late").length

        const attention: string[] = []
        if (database.level === "down") attention.push("The database is not responding.")
        else if (database.level === "warn") attention.push("The database is slow to answer.")
        if (jobsBad) attention.push(`${jobsBad} background ${jobsBad === 1 ? "job needs" : "jobs need"} a look.`)
        if (cache !== "ok") attention.push("The cache (Redis) is not connected. Pages still work, just slower.")
        if (backups.level === "warn") attention.push(backups.count ? "The newest data backup is more than 2 days old. The nightly backup may be failing." : "No data backup found.")
        if (!backups.offsite) attention.push("Backups are only saved on this server. Set up the S3 copy so one lost server does not lose everything.")
        if (!alerts.configured) attention.push("Phone alerts are not set up on the server, so nobody can turn them on yet.")
        else if (alerts.level === "warn") attention.push(`Only ${alerts.withAlerts} of ${alerts.activeUsers} people have alerts on. The rest will miss reminders when the app is closed.`)
        if (disk.level === "down") attention.push(`The server disk is ${disk.usedPercent}% full. Uploads and the database can stop working. Free space now.`)
        else if (disk.level === "warn") attention.push(`The server disk is ${disk.usedPercent}% full. Plan more space or move photos to S3.`)
        if (approvals.pcCount > 0 && approvals.pcOldestHours >= QUEUE_WARN_HOURS) attention.push(`${approvals.pcCount} ${approvals.pcCount === 1 ? "ticket is" : "tickets are"} waiting for PC approval. The oldest has waited ${approvals.pcOldestHours} hours.`)
        if (approvals.headCount > 0 && approvals.headOldestHours >= QUEUE_WARN_HOURS) attention.push(`${approvals.headCount} ${approvals.headCount === 1 ? "ticket is" : "tickets are"} waiting for a department head. The oldest has waited ${approvals.headOldestHours} hours.`)
        if (responses.known && responses.level === "down") attention.push("The app is answering very slowly or failing for many people right now.")
        else if (responses.known && responses.level === "warn") attention.push("The app is slower than usual or returning some errors. Check the Response time tile.")
        if (recentErrorCount) attention.push(`${recentErrorCount} unexpected server ${recentErrorCount === 1 ? "error" : "errors"} in the last 24 hours.`)

        return {
            checkedAt: new Date(),
            overall: database.level === "down" ? "down" : attention.length ? "attention" : "healthy",
            attention,
            server: {
                environment: env.NODE_ENV,
                nodeVersion: process.version,
                startedAt: processStartedAt,
                uptimeSeconds: Math.round(process.uptime()),
                memoryMb: Math.round(process.memoryUsage().rss / 1048576),
            },
            database,
            cache: { level: (cache === "ok" ? "ok" : "warn") as Level, status: cache },
            jobs,
            backups,
            alerts,
            disk: { ...disk, uploads },
            growth,
            approvals,
            responses,
            photoSync,
            errors,
        }
    },
}

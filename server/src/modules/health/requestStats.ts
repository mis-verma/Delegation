import cluster from "node:cluster"
import type { NextFunction, Request, Response } from "express"
import { gte, lt, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { requestStats } from "../../db/schema/core.js"

type Level = "ok" | "warn" | "down"

type Bucket = {
    requests: number
    totalMs: number
    maxMs: number
    under100: number
    under300: number
    under1000: number
    under3000: number
    over3000: number
    serverErrors: number
}

const MINUTE_MS = 60_000
const KEEP_HOURS = 48
const SKIPPED = ["/health", "/system-health", "/socket.io", "/uploads"]

const emptyBucket = (): Bucket => ({ requests: 0, totalMs: 0, maxMs: 0, under100: 0, under300: 0, under1000: 0, under3000: 0, over3000: 0, serverErrors: 0 })

let pending = new Map<number, Bucket>()

const record = (at: number, ms: number, serverError: boolean) => {
    const minute = Math.floor(at / MINUTE_MS) * MINUTE_MS
    const bucket = pending.get(minute) ?? emptyBucket()
    bucket.requests++
    bucket.totalMs += Math.round(ms)
    bucket.maxMs = Math.max(bucket.maxMs, Math.round(ms))
    if (ms < 100) bucket.under100++
    else if (ms < 300) bucket.under300++
    else if (ms < 1000) bucket.under1000++
    else if (ms < 3000) bucket.under3000++
    else bucket.over3000++
    if (serverError) bucket.serverErrors++
    pending.set(minute, bucket)
}

export const requestTimer = (req: Request, res: Response, next: NextFunction) => {
    if (SKIPPED.some((prefix) => req.originalUrl.startsWith(prefix))) return next()
    const started = process.hrtime.bigint()
    res.on("finish", () => {
        record(Date.now(), Number(process.hrtime.bigint() - started) / 1e6, res.statusCode >= 500)
    })
    next()
}

const workerId = () => cluster.worker?.id ?? 0

export const flushRequestStats = async () => {
    if (pending.size === 0) return
    const batch = pending
    pending = new Map()
    for (const [minute, b] of batch) {
        try {
            await db.insert(requestStats).values({ minute: new Date(minute), workerId: workerId(), ...b }).onDuplicateKeyUpdate({
                set: {
                    requests: sql`${requestStats.requests} + ${b.requests}`,
                    totalMs: sql`${requestStats.totalMs} + ${b.totalMs}`,
                    maxMs: sql`GREATEST(${requestStats.maxMs}, ${b.maxMs})`,
                    under100: sql`${requestStats.under100} + ${b.under100}`,
                    under300: sql`${requestStats.under300} + ${b.under300}`,
                    under1000: sql`${requestStats.under1000} + ${b.under1000}`,
                    under3000: sql`${requestStats.under3000} + ${b.under3000}`,
                    over3000: sql`${requestStats.over3000} + ${b.over3000}`,
                    serverErrors: sql`${requestStats.serverErrors} + ${b.serverErrors}`,
                },
            })
        } catch (err) {
            console.error("Request stats could not be saved", err)
        }
    }
}

const pruneRequestStats = async () => {
    try {
        await db.delete(requestStats).where(lt(requestStats.minute, new Date(Date.now() - KEEP_HOURS * 60 * MINUTE_MS)))
    } catch (err) {
        console.error("Old request stats could not be removed", err)
    }
}

export const startRequestStatsFlush = () => {
    const flush = setInterval(() => { void flushRequestStats() }, MINUTE_MS)
    flush.unref()
    if (workerId() <= 1) {
        const prune = setInterval(() => { void pruneRequestStats() }, 60 * MINUTE_MS)
        prune.unref()
    }
}

const UPPER_BOUNDS = [100, 300, 1000, 3000]

const percentileUpperBound = (counts: number[], total: number, share: number): number | null => {
    let seen = 0
    for (let i = 0; i < counts.length; i++) {
        seen += counts[i]
        if (seen >= total * share) return i < UPPER_BOUNDS.length ? UPPER_BOUNDS[i] : null
    }
    return null
}

export const responseSection = async () => {
    try {
        const since = new Date(Date.now() - 60 * MINUTE_MS)
        const [row] = await db
            .select({
                requests: sql<number>`COALESCE(SUM(${requestStats.requests}), 0)`,
                totalMs: sql<number>`COALESCE(SUM(${requestStats.totalMs}), 0)`,
                maxMs: sql<number>`COALESCE(MAX(${requestStats.maxMs}), 0)`,
                under100: sql<number>`COALESCE(SUM(${requestStats.under100}), 0)`,
                under300: sql<number>`COALESCE(SUM(${requestStats.under300}), 0)`,
                under1000: sql<number>`COALESCE(SUM(${requestStats.under1000}), 0)`,
                under3000: sql<number>`COALESCE(SUM(${requestStats.under3000}), 0)`,
                over3000: sql<number>`COALESCE(SUM(${requestStats.over3000}), 0)`,
                serverErrors: sql<number>`COALESCE(SUM(${requestStats.serverErrors}), 0)`,
            })
            .from(requestStats)
            .where(gte(requestStats.minute, since))
        const total = Number(row?.requests ?? 0)
        if (total === 0) return { level: "ok" as Level, known: false, requests: 0, avgMs: 0, maxMs: 0, p50Ms: null, p95Ms: null, slow: 0, serverErrors: 0 }
        const counts = [row.under100, row.under300, row.under1000, row.under3000, row.over3000].map(Number)
        const p95Ms = percentileUpperBound(counts, total, 0.95)
        const errorRate = Number(row.serverErrors) / total
        const enough = total >= 50
        const level: Level = p95Ms === null || (enough && errorRate >= 0.05) ? "down" : p95Ms >= 3000 || (enough && errorRate >= 0.02) ? "warn" : "ok"
        return {
            level,
            known: true,
            requests: total,
            avgMs: Math.round(Number(row.totalMs) / total),
            maxMs: Number(row.maxMs),
            p50Ms: percentileUpperBound(counts, total, 0.5),
            p95Ms,
            slow: counts[3] + counts[4],
            serverErrors: Number(row.serverErrors),
        }
    } catch (err) {
        console.error("Health: could not read response times", err)
        return { level: "warn" as Level, known: false, requests: 0, avgMs: 0, maxMs: 0, p50Ms: null, p95Ms: null, slow: 0, serverErrors: 0 }
    }
}

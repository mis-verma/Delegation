import { readdir, readFile, stat, statfs } from "node:fs/promises"
import { join } from "node:path"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "../../config/db.js"
import { tickets } from "../../db/schema/ticket.js"

type Level = "ok" | "warn" | "down"

const GB = 1024 ** 3
const MB = 1024 ** 2
const HOUR_MS = 3_600_000
const USAGE_TTL_MS = 15 * 60_000

export const DISK_WARN_PERCENT = 80
export const DISK_DOWN_PERCENT = 92
export const QUEUE_WARN_HOURS = 24
export const QUEUE_DOWN_HOURS = 72

const round1 = (n: number) => Math.round(n * 10) / 10

export const diskSection = async () => {
    try {
        const info = await statfs(process.cwd())
        const total = info.blocks * info.bsize
        const free = info.bavail * info.bsize
        const usedPercent = total > 0 ? Math.round((1 - free / total) * 100) : 0
        const level: Level = usedPercent >= DISK_DOWN_PERCENT ? "down" : usedPercent >= DISK_WARN_PERCENT ? "warn" : "ok"
        return { level, known: true, totalGb: round1(total / GB), freeGb: round1(free / GB), usedPercent }
    } catch {
        return { level: "warn" as Level, known: false, totalGb: 0, freeGb: 0, usedPercent: 0 }
    }
}

let usage: { at: number; bytes: number; files: number } | null = null
let measuring: Promise<void> | null = null

const measureFolder = async (root: string) => {
    let bytes = 0
    let files = 0
    const pending = [root]
    while (pending.length) {
        const dir = pending.pop() as string
        let entries
        try {
            entries = await readdir(dir, { withFileTypes: true })
        } catch {
            continue
        }
        for (const entry of entries) {
            const path = join(dir, entry.name)
            if (entry.isDirectory()) pending.push(path)
            else if (entry.isFile()) {
                try {
                    bytes += (await stat(path)).size
                    files++
                } catch {
                    continue
                }
            }
        }
    }
    usage = { at: Date.now(), bytes, files }
}

export const uploadsSection = () => {
    const stale = !usage || Date.now() - usage.at > USAGE_TTL_MS
    if (stale && !measuring) {
        measuring = measureFolder(join(process.cwd(), "uploads")).finally(() => { measuring = null })
    }
    if (!usage) return { measuring: true, sizeMb: 0, files: 0 }
    return { measuring: false, sizeMb: round1(usage.bytes / MB), files: usage.files }
}

type Manifest = { createdAt: string; rows: number; sizeBytes: number }

export const growthSection = async () => {
    const dir = join(process.cwd(), "backups")
    try {
        const names = (await readdir(dir)).filter((n) => n.startsWith("full-") && n.endsWith(".manifest.json")).sort()
        if (names.length < 2) return { known: false, days: 0, rowsPerDay: 0, sizeMbPerDay: 0, totalRows: 0 }
        const oldestName = names[0]
        const newestName = names.at(-1)
        if (!oldestName || !newestName) return { known: false, days: 0, rowsPerDay: 0, sizeMbPerDay: 0, totalRows: 0 }
        const oldest = JSON.parse(await readFile(join(dir, oldestName), "utf8")) as Manifest
        const newest = JSON.parse(await readFile(join(dir, newestName), "utf8")) as Manifest
        const days = (Date.parse(newest.createdAt) - Date.parse(oldest.createdAt)) / (24 * HOUR_MS)
        if (!(days >= 1)) return { known: false, days: 0, rowsPerDay: 0, sizeMbPerDay: 0, totalRows: newest.rows }
        return {
            known: true,
            days: Math.round(days),
            rowsPerDay: Math.round((newest.rows - oldest.rows) / days),
            sizeMbPerDay: round1((newest.sizeBytes - oldest.sizeBytes) / MB / days),
            totalRows: newest.rows,
        }
    } catch {
        return { known: false, days: 0, rowsPerDay: 0, sizeMbPerDay: 0, totalRows: 0 }
    }
}

const hoursSince = (date: Date | string | null | undefined) =>
    date ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / HOUR_MS)) : 0

const levelForHours = (hours: number, count: number): Level =>
    count === 0 ? "ok" : hours >= QUEUE_DOWN_HOURS ? "down" : hours >= QUEUE_WARN_HOURS ? "warn" : "ok"

export const approvalsSection = async () => {
    try {
        const [pc] = await db
            .select({ oldest: sql<Date | null>`MIN(${tickets.submittedAt})`, count: sql<number>`COUNT(*)` })
            .from(tickets)
            .where(and(isNull(tickets.deletedAt), eq(tickets.status, "PENDING_APPROVAL")))
        const [head] = await db
            .select({ oldest: sql<Date | null>`MIN(${tickets.createdAt})`, count: sql<number>`COUNT(*)` })
            .from(tickets)
            .where(and(isNull(tickets.deletedAt), isNull(tickets.declinedAt), eq(tickets.awaitingHeadApproval, true)))
        const pcCount = Number(pc?.count ?? 0)
        const headCount = Number(head?.count ?? 0)
        const pcHours = hoursSince(pc?.oldest)
        const headHours = hoursSince(head?.oldest)
        const worst = [levelForHours(pcHours, pcCount), levelForHours(headHours, headCount)]
        const level: Level = worst.includes("down") ? "down" : worst.includes("warn") ? "warn" : "ok"
        return { level, pcCount, pcOldestHours: pcHours, headCount, headOldestHours: headHours }
    } catch {
        return { level: "warn" as Level, pcCount: 0, pcOldestHours: 0, headCount: 0, headOldestHours: 0 }
    }
}

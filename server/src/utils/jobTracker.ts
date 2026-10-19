import cron from "node-cron"
import { sql } from "drizzle-orm"
import { db } from "../config/db.js"
import { jobRuns } from "../db/schema/core.js"

type RegisteredJob = { name: string; expression: string; everyMinutes: number }
const registry = new Map<string, RegisteredJob>()

export const registeredJobs = (): RegisteredJob[] => [...registry.values()]

const recordRun = async (job: RegisteredJob, startedAt: Date, error: unknown) => {
    const finishedAt = new Date()
    const failed = error !== null
    const message = failed ? String((error as Error)?.message ?? error).slice(0, 1000) : null
    const durationMs = finishedAt.getTime() - startedAt.getTime()
    try {
        await db.insert(jobRuns).values({
            name: job.name,
            schedule: job.expression,
            expectedEveryMinutes: job.everyMinutes,
            lastStartedAt: startedAt,
            lastFinishedAt: finishedAt,
            lastDurationMs: durationMs,
            lastStatus: failed ? "FAILED" : "OK",
            lastError: message,
            runCount: 1,
            failCount: failed ? 1 : 0,
            lastFailedAt: failed ? finishedAt : null,
        }).onDuplicateKeyUpdate({
            set: {
                schedule: job.expression,
                expectedEveryMinutes: job.everyMinutes,
                lastStartedAt: startedAt,
                lastFinishedAt: finishedAt,
                lastDurationMs: durationMs,
                lastStatus: failed ? "FAILED" : "OK",
                lastError: message,
                runCount: sql`${jobRuns.runCount} + 1`,
                failCount: failed ? sql`${jobRuns.failCount} + 1` : sql`${jobRuns.failCount}`,
                lastFailedAt: failed ? finishedAt : sql`${jobRuns.lastFailedAt}`,
            },
        })
    } catch (err) {
        console.error(`Job heartbeat for ${job.name} could not be saved`, err)
    }
}

export const scheduleJob = (name: string, expression: string, everyMinutes: number, run: () => unknown | Promise<unknown>) => {
    const job: RegisteredJob = { name, expression, everyMinutes }
    registry.set(name, job)
    return cron.schedule(expression, async () => {
        const startedAt = new Date()
        let error: unknown = null
        try {
            await run()
        } catch (err) {
            error = err
            console.error(`Job ${name} failed`, err)
        }
        await recordRun(job, startedAt, error)
    })
}

import os from "node:os"

/**
 * Sharp decodes are CPU and memory heavy, so only a few run at once. Two was a safe floor for a
 * single-core box; on a bigger one that left a 25-photo burst waiting on an idle CPU.
 */
const cpuCount = (() => {
    try {
        return os.cpus()?.length || 1
    } catch {
        return 1
    }
})()

const configured = Number(process.env.MAX_PARALLEL_IMAGE_JOBS)

export const MAX_PARALLEL_IMAGE_JOBS = Number.isFinite(configured) && configured >= 1
    ? Math.floor(configured)
    : Math.max(2, Math.min(4, cpuCount - 1))

let active = 0
const waiting: (() => void)[] = []

const acquire = async (): Promise<void> => {
    if (active < MAX_PARALLEL_IMAGE_JOBS) {
        active += 1
        return
    }
    await new Promise<void>((resolve) => waiting.push(resolve))
}

const release = () => {
    const next = waiting.shift()
    if (next) next()
    else active -= 1
}

export const withImageSlot = async <T>(job: () => Promise<T>): Promise<T> => {
    await acquire()
    try {
        return await job()
    } finally {
        release()
    }
}

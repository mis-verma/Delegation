export const MAX_PARALLEL_IMAGE_JOBS = 2

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

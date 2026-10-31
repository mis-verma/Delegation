export const forEachLimit = async <T>(items: readonly T[], limit: number, run: (item: T) => Promise<unknown>): Promise<void> => {
    let next = 0
    let failed = false
    let failure: unknown

    const worker = async () => {
        while (!failed) {
            const index = next
            next += 1
            if (index >= items.length) return
            try {
                await run(items[index] as T)
            } catch (err) {
                if (!failed) {
                    failed = true
                    failure = err
                }
            }
        }
    }

    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
    if (failed) throw failure
}

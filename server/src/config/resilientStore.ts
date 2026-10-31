import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from "express-rate-limit"

const STORE_WAIT_MS = 500

const withTimeout = <T>(work: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("rate-limit store timed out")), STORE_WAIT_MS)
        work.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })

export const resilientStore = (primary: Store): Store => {
    const fallback = new MemoryStore()
    return {
        prefix: primary.prefix,
        localKeys: false,
        async init(options: Options) {
            fallback.init(options)
            await primary.init?.(options)
        },
        async get(key: string): Promise<ClientRateLimitInfo | undefined> {
            try {
                return await withTimeout(Promise.resolve(primary.get?.(key)))
            } catch {
                return fallback.get(key)
            }
        },
        async increment(key: string): Promise<ClientRateLimitInfo> {
            try {
                return await withTimeout(Promise.resolve(primary.increment(key)))
            } catch {
                return fallback.increment(key)
            }
        },
        async decrement(key: string) {
            try {
                await withTimeout(Promise.resolve(primary.decrement(key)))
            } catch {
                fallback.decrement(key)
            }
        },
        async resetKey(key: string) {
            fallback.resetKey(key)
            try {
                await withTimeout(Promise.resolve(primary.resetKey(key)))
            } catch {
            }
        },
    }
}

import { MemoryStore, type ClientRateLimitInfo, type Options, type Store } from "express-rate-limit"

const STORE_WAIT_MS = 500
export const TRIP_AFTER_FAILURES = 5
export const COOL_DOWN_MS = 10_000

const withTimeout = <T>(work: Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("rate-limit store timed out")), STORE_WAIT_MS)
        work.then(
            (value) => { clearTimeout(timer); resolve(value) },
            (err) => { clearTimeout(timer); reject(err) },
        )
    })

/**
 * Decides whether the shared store is still worth talking to.
 *
 * A store that is down fails fast by itself, and a healthy one answers in well under a
 * millisecond. The state that hurts is sick but reachable: every request then waits the full
 * timeout before falling back, so a struggling Redis adds that wait to the whole API. After
 * enough consecutive failures this opens and calls go straight to the local fallback. Once the
 * cool-down passes a single request is let through to probe; the rest keep using the fallback
 * until that probe says the store is healthy again.
 */
class Breaker {
    private failures = 0
    private openedAt = 0
    private probing = false

    get isOpen(): boolean {
        return this.failures >= TRIP_AFTER_FAILURES
    }

    allows(now = Date.now()): boolean {
        if (!this.isOpen) return true
        if (now - this.openedAt < COOL_DOWN_MS) return false
        if (this.probing) return false
        this.probing = true
        return true
    }

    succeeded(): void {
        this.failures = 0
        this.probing = false
    }

    failed(now = Date.now()): void {
        this.failures += 1
        this.probing = false
        if (this.isOpen) this.openedAt = now
    }
}

export const resilientStore = (primary: Store): Store => {
    const fallback = new MemoryStore()
    const breaker = new Breaker()

    const viaPrimary = async <T>(call: () => Promise<T> | T, onFailure: () => Promise<T> | T): Promise<T> => {
        if (!breaker.allows()) return await onFailure()
        try {
            const value = await withTimeout(Promise.resolve(call()))
            breaker.succeeded()
            return value
        } catch {
            breaker.failed()
            return await onFailure()
        }
    }

    return {
        prefix: primary.prefix,
        localKeys: false,
        async init(options: Options) {
            fallback.init(options)
            await primary.init?.(options)
        },
        get: (key: string): Promise<ClientRateLimitInfo | undefined> =>
            viaPrimary(() => primary.get?.(key), () => fallback.get(key)),
        increment: (key: string): Promise<ClientRateLimitInfo> =>
            viaPrimary(() => primary.increment(key), () => fallback.increment(key)),
        decrement: async (key: string) => {
            await viaPrimary(() => primary.decrement(key), () => fallback.decrement(key))
        },
        async resetKey(key: string) {
            fallback.resetKey(key)
            await viaPrimary(() => primary.resetKey(key), () => undefined)
        },
    }
}

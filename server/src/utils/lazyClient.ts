export const lazyClient = <T>(envVar: string, build: () => T): (() => T) => {
    let client: T | null = null
    return () => {
        if (!process.env[envVar]) throw new Error(`${envVar} is not set`)
        if (!client) client = build()
        return client
    }
}

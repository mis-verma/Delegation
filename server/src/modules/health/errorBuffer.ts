
export type RecordedError = { at: string; method: string; path: string; message: string }

const MAX_ERRORS = 30
const errors: RecordedError[] = []

export const recordServerError = (method: string, path: string, err: unknown) => {
    errors.unshift({
        at: new Date().toISOString(),
        method,
        path,
        message: String((err as Error)?.message ?? err).slice(0, 300),
    })
    if (errors.length > MAX_ERRORS) errors.length = MAX_ERRORS
}

export const recentServerErrors = (): RecordedError[] => [...errors]

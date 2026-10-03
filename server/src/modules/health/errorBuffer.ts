// The last few unexpected server errors (the 500s the error handler masks from users), kept in
// memory so an admin can see "what just broke" on the System Health page without opening server
// logs. Deliberately not persisted: it resets on restart, which is itself useful (the page shows
// the process start time). Only the message and the route are kept, never request bodies.

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

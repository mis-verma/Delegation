type DriverFailure = { code?: string; message?: string; cause?: { code?: string; message?: string } } | null

export const driverError = (err: unknown) => {
    const failure = err as DriverFailure
    return { code: failure?.cause?.code ?? failure?.code, message: `${failure?.cause?.message ?? ""} ${failure?.message ?? ""}` }
}

export const isDuplicateEntryError = (err: unknown) => driverError(err).code === "ER_DUP_ENTRY"

export const asRows = <T extends Record<string, unknown>>(rows: unknown): T[] => rows as T[]

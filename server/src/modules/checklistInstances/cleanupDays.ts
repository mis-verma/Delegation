const DAY_MS = 86_400_000

export const dayRange = (fromDate?: string, toDate?: string): { from?: Date; to?: Date } => ({
    ...(fromDate ? { from: new Date(`${fromDate}T00:00:00.000Z`) } : {}),
    ...(toDate ? { to: new Date(new Date(`${toDate}T00:00:00.000Z`).getTime() + DAY_MS) } : {}),
})

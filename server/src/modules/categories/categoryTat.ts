export type TatTicket = {
    id: string
    categoryId: string | null
    createdAt: Date
    closedAt: Date | null
    declinedAt: Date | null
    status: string
    tatDueAt: Date | null
}

export type TatUpdate = {
    ticketId: string
    toStatus: string
    createdAt: Date
}

export type TatCategory = {
    id: string
    name: string
    isActive: boolean
    departmentName: string | null
    tatHours: number | null
}

export type TatSummary = {
    count: number
    avg: number | null
    median: number | null
    p80: number | null
    p90: number | null
}

export type CategoryTatRow = {
    categoryId: string | null
    name: string
    departmentName: string | null
    configuredTatHours: number | null
    total: number
    closed: number
    rejected: number
    open: number
    response: TatSummary
    completion: TatSummary
    closure: TatSummary
    onHoldAvg: number | null
    slaMet: number
    slaBreached: number
    slaMetPct: number | null
    suggestedTatHours: number | null
}

export type CategoryTatReport = {
    rows: CategoryTatRow[]
    total: CategoryTatRow
}

const MS_PER_MINUTE = 60_000
const MIN_SAMPLES_FOR_SUGGESTION = 5
const SUGGESTION_PERCENTILE_KEY = "p80" as const
const UNCATEGORISED = "Uncategorised"

const round1 = (value: number) => Math.round(value * 10) / 10

const minutesBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / MS_PER_MINUTE)

const percentile = (sorted: number[], p: number): number => {
    const index = (sorted.length - 1) * p
    const low = Math.floor(index)
    const high = Math.ceil(index)
    return sorted[low]! + (sorted[high]! - sorted[low]!) * (index - low)
}

export const summarize = (values: number[]): TatSummary => {
    if (values.length === 0) return { count: 0, avg: null, median: null, p80: null, p90: null }
    const sorted = [...values].sort((a, b) => a - b)
    const sum = sorted.reduce((acc, value) => acc + value, 0)
    return {
        count: sorted.length,
        avg: round1(sum / sorted.length),
        median: round1(percentile(sorted, 0.5)),
        p80: round1(percentile(sorted, 0.8)),
        p90: round1(percentile(sorted, 0.9)),
    }
}

type Bucket = {
    categoryId: string | null
    name: string
    departmentName: string | null
    configuredTatHours: number | null
    total: number
    closed: number
    rejected: number
    open: number
    response: number[]
    completion: number[]
    closure: number[]
    onHold: number[]
    slaMet: number
    slaBreached: number
}

const emptyBucket = (categoryId: string | null, name: string, departmentName: string | null, configuredTatHours: number | null): Bucket => ({
    categoryId,
    name,
    departmentName,
    configuredTatHours,
    total: 0,
    closed: 0,
    rejected: 0,
    open: 0,
    response: [],
    completion: [],
    closure: [],
    onHold: [],
    slaMet: 0,
    slaBreached: 0,
})

const onHoldMinutes = (updates: TatUpdate[], closedAt: Date | null): number => {
    let total = 0
    updates.forEach((update, index) => {
        if (update.toStatus !== "ON_HOLD") return
        const end = updates[index + 1]?.createdAt ?? closedAt
        if (end) total += minutesBetween(update.createdAt, end)
    })
    return total
}

const addTicket = (bucket: Bucket, ticket: TatTicket, updates: TatUpdate[]) => {
    bucket.total += 1
    const rejected = ticket.declinedAt !== null
    const closed = ticket.status === "CLOSED" && !rejected
    if (rejected) bucket.rejected += 1
    else if (closed) bucket.closed += 1
    else bucket.open += 1
    if (rejected) return

    const first = updates[0]
    if (first) bucket.response.push(minutesBetween(ticket.createdAt, first.createdAt))
    if (!closed) return

    const doneAt = updates.find((update) => update.toStatus === "PENDING_APPROVAL")?.createdAt ?? ticket.closedAt
    if (doneAt) bucket.completion.push(minutesBetween(ticket.createdAt, doneAt))
    if (ticket.closedAt) bucket.closure.push(minutesBetween(ticket.createdAt, ticket.closedAt))
    bucket.onHold.push(onHoldMinutes(updates, ticket.closedAt))
    if (doneAt && ticket.tatDueAt) {
        if (doneAt.getTime() <= ticket.tatDueAt.getTime()) bucket.slaMet += 1
        else bucket.slaBreached += 1
    }
}

const finish = (bucket: Bucket): CategoryTatRow => {
    const completion = summarize(bucket.completion)
    const judged = bucket.slaMet + bucket.slaBreached
    const suggestedMinutes = completion.count >= MIN_SAMPLES_FOR_SUGGESTION ? completion[SUGGESTION_PERCENTILE_KEY] : null
    return {
        categoryId: bucket.categoryId,
        name: bucket.name,
        departmentName: bucket.departmentName,
        configuredTatHours: bucket.configuredTatHours,
        total: bucket.total,
        closed: bucket.closed,
        rejected: bucket.rejected,
        open: bucket.open,
        response: summarize(bucket.response),
        completion,
        closure: summarize(bucket.closure),
        onHoldAvg: bucket.onHold.length ? round1(bucket.onHold.reduce((acc, value) => acc + value, 0) / bucket.onHold.length) : null,
        slaMet: bucket.slaMet,
        slaBreached: bucket.slaBreached,
        slaMetPct: judged > 0 ? round1((bucket.slaMet / judged) * 100) : null,
        suggestedTatHours: suggestedMinutes === null ? null : Math.max(1, Math.ceil(suggestedMinutes / 60)),
    }
}

export const buildCategoryTat = (categories: TatCategory[], tickets: TatTicket[], updates: TatUpdate[]): CategoryTatReport => {
    const updatesByTicket = new Map<string, TatUpdate[]>()
    for (const update of updates) {
        const list = updatesByTicket.get(update.ticketId) ?? []
        list.push(update)
        updatesByTicket.set(update.ticketId, list)
    }
    for (const list of updatesByTicket.values()) list.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

    const buckets = new Map<string | null, Bucket>()
    for (const category of categories) {
        buckets.set(category.id, emptyBucket(category.id, category.name, category.departmentName, category.tatHours))
    }
    const everything = emptyBucket(null, "All categories", null, null)

    for (const ticket of tickets) {
        const key = ticket.categoryId && buckets.has(ticket.categoryId) ? ticket.categoryId : null
        const bucket = buckets.get(key) ?? emptyBucket(null, UNCATEGORISED, null, null)
        buckets.set(key, bucket)
        const list = updatesByTicket.get(ticket.id) ?? []
        addTicket(bucket, ticket, list)
        addTicket(everything, ticket, list)
    }

    const active = new Set(categories.filter((category) => category.isActive).map((category) => category.id))
    const rows = [...buckets.values()]
        .filter((bucket) => bucket.total > 0 || (bucket.categoryId !== null && active.has(bucket.categoryId)))
        .map(finish)
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))

    return { rows, total: finish(everything) }
}

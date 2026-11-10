export type ShareRun = { id: string; itemsTotal: number; itemsDone: number; assigneeCount: number }

const round1 = (n: number) => Math.round(n * 10) / 10

export const personItemShare = (
    runs: Iterable<ShareRun>,
    answeredBy: (runId: string) => number,
    answeredByAssignees: (runId: string) => number,
): { itemsDue: number; itemsDone: number } => {
    const seen = new Set<string>()
    let due = 0
    let done = 0
    for (const r of runs) {
        if (seen.has(r.id)) continue
        seen.add(r.id)
        if (r.assigneeCount <= 1) {
            due += r.itemsTotal
            done += r.itemsDone
            continue
        }
        const mine = Math.min(answeredBy(r.id), r.itemsDone)
        const byOthers = Math.max(0, r.itemsDone - answeredByAssignees(r.id))
        const open = Math.max(0, r.itemsTotal - r.itemsDone)
        due += mine + (open + byOthers) / r.assigneeCount
        done += mine + byOthers / r.assigneeCount
    }
    return { itemsDue: round1(due), itemsDone: round1(done) }
}

import { metDeadlinePct, pct, pooledCompliancePct, round1 } from "../scores/scoreFormulas.js"

export type PersonRunFact = {
    instanceId: string
    day: string
    totalItems: number
    doneItems: number
    missed: boolean
    filled: boolean
    onTime: boolean
}

export type PersonAnswerFact = { instanceId: string; good: number; scored: number }

export type PersonFillFigures = {
    questionsDue: number
    questionsDone: number
    questionsPct: number | null
    runsDue: number
    runsOnTime: number
    metDeadlinePct: number | null
    answersGood: number
    answersChecked: number
    compliancePct: number | null
}

const dayIsOpen = (runs: readonly PersonRunFact[], day: string, today: string) => {
    const missed = runs.filter((r) => r.missed).length
    const filled = runs.filter((r) => r.filled).length
    return missed === 0 && day >= today && filled < runs.length
}

export const personFillFigures = (runs: readonly PersonRunFact[], answers: readonly PersonAnswerFact[], today: string): PersonFillFigures => {
    const byDay = new Map<string, PersonRunFact[]>()
    for (const r of runs) {
        const list = byDay.get(r.day)
        if (list) list.push(r)
        else byDay.set(r.day, [r])
    }
    const counted = new Set<string>()
    let questionsDue = 0
    let questionsDone = 0
    let runsDue = 0
    let runsOnTime = 0
    for (const [day, list] of byDay) {
        if (day > today || dayIsOpen(list, day, today)) continue
        for (const r of list) {
            if (counted.has(r.instanceId)) continue
            counted.add(r.instanceId)
            runsDue += 1
            questionsDue += r.totalItems
            questionsDone += Math.min(r.doneItems, r.totalItems)
            if (r.onTime) runsOnTime += 1
        }
    }
    let good = 0
    let scored = 0
    for (const a of answers) {
        if (!counted.has(a.instanceId)) continue
        good += a.good
        scored += a.scored
    }
    return {
        questionsDue,
        questionsDone,
        questionsPct: pct(questionsDone, questionsDue),
        runsDue,
        runsOnTime,
        metDeadlinePct: metDeadlinePct(runsOnTime, runsDue),
        answersGood: round1(good) ?? 0,
        answersChecked: round1(scored) ?? 0,
        compliancePct: pooledCompliancePct([{ weightedGood: good, weightedScored: scored }]),
    }
}

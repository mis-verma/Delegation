import { scheduleJob } from "../utils/jobTracker.js"
import { assertScoreConsistency, nightlyWindows } from "../modules/scores/scoreConsistency.js"
import { orgToday } from "../modules/scores/scoreExplorer.service.js"

export const startScoreDataCheck = () => {
    scheduleJob("score-data-check", "40 2 * * *", 1440, async () => {
        const failures: string[] = []
        for (const w of nightlyWindows(orgToday())) {
            const result = await assertScoreConsistency(w.from, w.to)
            if (result.flagged > 0) console.log(`Score data check (${w.label}): ${result.flagged} explained gaps (shared checklist runs)`)
            if (!result.ok) {
                const bad = result.checks.filter((c) => c.status === "fail").slice(0, 3).map((c) => `${c.label} (${c.expected} vs ${c.actual})`)
                failures.push(`${w.label} ${w.from}..${w.to}: ${result.failed} failed. ${bad.join("; ")}`)
            }
        }
        if (failures.length) throw new Error(`Score data check failed. ${failures.join(" | ")}`)
    })
}

import { scheduleJob } from "../utils/jobTracker.js"
import { assertScoreConsistency, nightlyWindows } from "../modules/scores/scoreConsistency.js"
import { orgToday } from "../modules/scores/scoreExplorer.service.js"

/**
 * Nightly score data check: proves the department, store and people cuts of the scores still add up to the
 * organisation total, for last month and month to date. A must-equal check that fails makes the job FAIL, so
 * System Health shows it (the message names the first failing checks). Explained gaps (shared checklist runs)
 * are only logged, never a failure.
 */
export const startScoreDataCheck = () => {
    // 02:40 daily, after the daily runs are generated and before people start their day.
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
        // Both windows run before this throws, so one bad month never hides the other.
        if (failures.length) throw new Error(`Score data check failed. ${failures.join(" | ")}`)
    })
}

import { env } from '../config/env.js'

// Shared guard for maintenance/seed scripts that shouldn't run against a real database by
// accident — a mistaken `.env` pointed at production, or a copy-pasted command in the wrong
// terminal, would otherwise pollute genuine Task/Ticket/Checklist/Todo tables with fabricated rows
// indistinguishable from real ones. Pass `--allow-production` to run anyway.
export function refuseInProductionUnlessOverridden(scriptLabel: string): void {
    if (env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
        console.error(`Refusing to run ${scriptLabel} against NODE_ENV=production. Pass --allow-production if you really mean to seed the production database.`)
        process.exit(1)
    }
}

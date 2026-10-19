import { env } from '../config/env.js'

export function refuseInProductionUnlessOverridden(scriptLabel: string): void {
    if (env.NODE_ENV === 'production' && !process.argv.includes('--allow-production')) {
        console.error(`Refusing to run ${scriptLabel} against NODE_ENV=production. Pass --allow-production if you really mean to seed the production database.`)
        process.exit(1)
    }
}

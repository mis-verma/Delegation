import '../config/loadEnv.js'
import { connectDB, disconnectDB } from '../config/db.js'
import { dropUntouchedLongRuns } from '../jobs/checklistInstanceGenerator.job.js'

const apply = process.argv.includes('--apply')

const run = async () => {
    await connectDB()
    const { found, removed } = await dropUntouchedLongRuns(apply)
    if (apply) {
        console.log(`Removed ${removed} untouched weekly, monthly, quarterly or yearly run(s) of ${found} found. Runs people started were kept.`)
    } else {
        console.log(`Dry run: ${found} old whole-period run(s) are still open and nobody has touched ${removed} of them.`)
        console.log('Run again with --apply to remove those. Runs people started are always kept.')
    }
    await disconnectDB()
}

run().catch((err) => {
    console.error(err)
    process.exit(1)
})

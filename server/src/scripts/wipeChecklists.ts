import 'dotenv/config'
import { connectDB, disconnectDB, db } from '../config/db.js'
import { checklistDefinitions } from '../db/schema/index.js'
import { env } from '../config/env.js'

const confirmed = process.argv.includes('--yes')
const productionOverride = process.argv.includes('--allow-production')

const run = async () => {
  if (!confirmed) {
    console.error('Refusing to run: pass --yes to confirm you want to permanently delete every checklist definition (and all its instances/items/submissions/images).')
    process.exit(1)
  }
  if (env.NODE_ENV === 'production' && !productionOverride) {
    console.error('Refusing to run against NODE_ENV=production. Pass --allow-production as well if you really mean to wipe the production database.')
    process.exit(1)
  }

  await connectDB()

  const deleted = await db.delete(checklistDefinitions)
  console.log(`Deleted ${deleted[0].affectedRows} checklist definition(s) (cascaded to all instances/items/submissions/images).`)

  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('Wipe failed:', err)
  await disconnectDB()
  process.exit(1)
})

import 'dotenv/config'
import { db, disconnectDB } from '../config/db.js'
import { settings } from '../db/schema/core.js'

const run = async () => {
  await db.update(settings).set({ requireAdminLoginCode: false, updatedAt: new Date() })
  console.log('The Admin sign-in code is now off. Restart the server so it takes effect everywhere.')
  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('Could not turn it off:', err instanceof Error ? err.message : err)
  await disconnectDB()
  process.exit(1)
})

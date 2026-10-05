// Command-line backup (run like: `npm run backup:data`; on the live server `node dist/src/scripts/backupData.js`).
// Dumps every row of the Ticket, Delegation (Task) and recurring Checklist tables to JSON under
// server/backups/<timestamp>/<group>/<table>.json, a rollback point to take before any destructive
// script (see wipeChecklists.ts). The same code runs automatically every night (jobs/dataBackup.job.ts).
// Read-only: never deletes or modifies anything in the database. Pass --offsite to also copy it to S3.
import 'dotenv/config'
import { connectDB, disconnectDB } from '../config/db.js'
import { copyBackupToS3, runDataBackup } from '../utils/dataBackup.js'

const run = async () => {
  await connectDB()

  const backup = await runDataBackup()
  for (const d of backup.detail) console.log(`${d.group}/${d.table}: ${d.rows} row(s)`)
  console.log(`\nBackup written to ${backup.dir}`)

  if (process.argv.includes('--offsite')) {
    const copied = await copyBackupToS3(backup)
    console.log(copied === null ? 'No S3 bucket configured (AWS_S3_BUCKET and keys), so nothing was copied off the server.' : `${copied} files copied to S3 under backups/${backup.name}/`)
  }

  await disconnectDB()
  process.exit(0)
}

run().catch(async (err) => {
  console.error('Backup failed:', err)
  await disconnectDB()
  process.exit(1)
})

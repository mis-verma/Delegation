import '../config/loadEnv.js'
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

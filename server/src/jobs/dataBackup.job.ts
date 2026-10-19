import { scheduleJob } from '../utils/jobTracker.js'
import { AUTO_BACKUP_PREFIX, copyBackupToS3, offsiteConfigured, pruneAutoBackups, runDataBackup } from '../utils/dataBackup.js'

const KEEP_LOCAL = 14

export const startDataBackup = () => {
  scheduleJob('data-backup', '30 2 * * *', 1440, async () => {
    const backup = await runDataBackup(AUTO_BACKUP_PREFIX)
    const removed = await pruneAutoBackups(KEEP_LOCAL)
    let copied: number | null = null
    try {
      copied = await copyBackupToS3(backup)
    } catch (err) {
      throw new Error(`Backup ${backup.name} saved on the server, but the copy to S3 failed: ${(err as Error).message}`)
    }
    console.log(
      `[data-backup] ${backup.name}: ${backup.rows} rows in ${backup.tables} tables, ` +
      `${copied === null ? (offsiteConfigured() ? 'copy skipped' : 'no S3 bucket configured, server copy only') : `${copied} files copied to S3`}, ${removed} old removed`,
    )
  })
}

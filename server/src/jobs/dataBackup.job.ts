import { scheduleJob } from '../utils/jobTracker.js'
import { AUTO_BACKUP_PREFIX, copyBackupToS3, offsiteConfigured, pruneAutoBackups, runDataBackup } from '../utils/dataBackup.js'

// How many nightly backups stay on the server. Two weeks matches the System Health warning, which
// turns amber when the newest backup is older than that.
const KEEP_LOCAL = 14

/**
 * Takes a data backup every night and copies it off the server when an S3 bucket is configured.
 *
 * A backup that only lives next to the database is gone with it, so the copy matters. If it fails the
 * job fails on purpose (System Health shows it as failing) even though the local backup is already
 * safe on disk: a silent offsite gap is exactly what nobody would notice until the day it is needed.
 */
export const startDataBackup = () => {
  // 02:30 daily, before the 03:xx retention jobs trim the tables it is about to copy.
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

import { scheduleJob } from '../utils/jobTracker.js'
import { AUTO_BACKUP_PREFIX, copyBackupToS3, offsiteConfigured, pruneAutoBackups, runDataBackup, verifyBackup } from '../utils/dataBackup.js'
import { copyFullBackupToS3, pruneFullBackups, runFullBackup } from '../utils/fullBackup.js'
import { notificationService } from '../modules/notifications/notification.service.js'

const KEEP_LOCAL = 14

const runFullCycle = async () => {
  const full = await runFullBackup()
  const removed = await pruneFullBackups(KEEP_LOCAL)
  let copied = false
  try {
    copied = await copyFullBackupToS3(full)
  } catch (err) {
    throw new Error(`Full backup ${full.name} saved on the server, but the copy to S3 failed: ${(err as Error).message}`)
  }
  console.log(
    `[full-backup] ${full.name}: ${full.rows} rows in ${Object.keys(full.tables).length} tables, ${Math.round(full.sizeBytes / 1024)} KB, ` +
    `${copied ? 'copied to S3' : 'no S3 bucket configured, server copy only'}, ${removed} old removed`,
  )
}

const runBackupCycle = async () => {
  const backup = await runDataBackup(AUTO_BACKUP_PREFIX)
  await verifyBackup(backup)
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
}

export const startDataBackup = () => {
  scheduleJob('data-backup', '30 2 * * *', 1440, async () => {
    try {
      await runBackupCycle()
      await runFullCycle()
    } catch (err) {
      await notificationService.notifyBackupFailed((err as Error).message).catch((notifyErr) => console.error('[data-backup] could not tell the admins', notifyErr))
      throw err
    }
  })
}

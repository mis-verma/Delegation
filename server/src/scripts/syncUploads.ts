import 'dotenv/config'
import { runUploadsSync } from '../utils/uploadsSync.js'

const run = async () => {
  const result = await runUploadsSync()
  if (!result.configured) {
    console.log('No S3 bucket configured (AWS_S3_BUCKET and keys), so nothing was copied off the server.')
    process.exit(0)
  }
  console.log(`${result.uploaded} new files copied to S3 under uploads/, ${result.pending} still waiting, ${result.failed} failed, ${result.total} files on disk.`)
  if (result.pending > 0) console.log('Run it again to continue. Each run copies up to 5000 files.')
  console.log('To restore the photos, copy s3://<bucket>/uploads/ back into the server uploads folder.')
  process.exit(result.failed > 0 ? 1 : 0)
}

run().catch((err) => {
  console.error('Uploads sync failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})

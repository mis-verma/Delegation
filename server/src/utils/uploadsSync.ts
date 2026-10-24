import { createReadStream } from 'node:fs'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { env } from '../config/env.js'
import { offsiteConfigured } from './dataBackup.js'

export interface LocalFile {
  rel: string
  size: number
  mtimeMs: number
}

export interface SyncState {
  files: Record<string, { size: number; mtimeMs: number }>
  lastRunAt: string | null
  lastUploaded: number
}

export interface SyncResult {
  configured: boolean
  total: number
  uploaded: number
  pending: number
  failed: number
}

export type UploadFile = (file: LocalFile, absolute: string) => Promise<void>

const MAX_FILES_PER_RUN = 5000
const TIME_BUDGET_MS = 25 * 60_000
const PARALLEL = 4
const SAVE_EVERY = 50

const uploadsRoot = () => join(process.cwd(), 'uploads')
const stateFile = () => join(process.cwd(), 'backups', 'uploads-sync-state.json')

const emptyState = (): SyncState => ({ files: {}, lastRunAt: null, lastUploaded: 0 })

export const planUploads = (files: LocalFile[], state: SyncState, limit: number): { toUpload: LocalFile[]; pending: number } => {
  const changed = files.filter((f) => {
    const known = state.files[f.rel]
    return !known || known.size !== f.size || known.mtimeMs !== f.mtimeMs
  })
  changed.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return { toUpload: changed.slice(0, limit), pending: Math.max(0, changed.length - limit) }
}

export const listUploadFiles = async (root = uploadsRoot()): Promise<LocalFile[]> => {
  const out: LocalFile[] = []
  const pending = [root]
  while (pending.length) {
    const dir = pending.pop() as string
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        pending.push(path)
      } else if (entry.isFile()) {
        try {
          const info = await stat(path)
          out.push({ rel: relative(root, path).split(sep).join('/'), size: info.size, mtimeMs: Math.floor(info.mtimeMs) })
        } catch {
          continue
        }
      }
    }
  }
  return out
}

export const readSyncState = async (file = stateFile()): Promise<SyncState> => {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as Partial<SyncState>
    return { files: parsed.files ?? {}, lastRunAt: parsed.lastRunAt ?? null, lastUploaded: parsed.lastUploaded ?? 0 }
  } catch {
    return emptyState()
  }
}

const saveSyncState = async (state: SyncState, file = stateFile()) => {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(state))
}

export const readSyncStatus = async () => {
  const state = await readSyncState()
  return { syncedFiles: Object.keys(state.files).length, lastRunAt: state.lastRunAt }
}

const s3Uploader = async (): Promise<{ upload: UploadFile; close: () => void }> => {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3')
  const client = new S3Client({
    region: env.AWS_REGION,
    credentials: { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY },
  })
  return {
    upload: async (file, absolute) => {
      await client.send(new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: `uploads/${file.rel}`,
        Body: createReadStream(absolute),
        ContentLength: file.size,
        ServerSideEncryption: 'AES256',
      }))
    },
    close: () => client.destroy(),
  }
}

export const runUploadsSync = async (options: { upload?: UploadFile; maxFiles?: number; budgetMs?: number; root?: string; stateFile?: string } = {}): Promise<SyncResult> => {
  const injected = options.upload
  if (!injected && !offsiteConfigured()) return { configured: false, total: 0, uploaded: 0, pending: 0, failed: 0 }

  const root = options.root ?? uploadsRoot()
  const files = await listUploadFiles(root)
  const statePath = options.stateFile ?? stateFile()
  const state = await readSyncState(statePath)
  const { toUpload, pending } = planUploads(files, state, options.maxFiles ?? MAX_FILES_PER_RUN)

  const remote = injected ? null : await s3Uploader()
  const upload = injected ?? (remote as { upload: UploadFile }).upload
  const deadline = Date.now() + (options.budgetMs ?? TIME_BUDGET_MS)
  let uploaded = 0
  let failed = 0
  let sinceSave = 0
  let leftOver = pending

  try {
    for (let i = 0; i < toUpload.length; i += PARALLEL) {
      if (Date.now() > deadline) {
        leftOver += toUpload.length - i
        break
      }
      const slice = toUpload.slice(i, i + PARALLEL)
      const outcomes = await Promise.allSettled(slice.map((file) => upload(file, join(root, ...file.rel.split('/')))))
      outcomes.forEach((outcome, k) => {
        const file = slice[k]
        if (outcome.status === 'fulfilled' && file) {
          state.files[file.rel] = { size: file.size, mtimeMs: file.mtimeMs }
          uploaded++
          sinceSave++
        } else {
          failed++
        }
      })
      if (sinceSave >= SAVE_EVERY) {
        await saveSyncState(state, statePath)
        sinceSave = 0
      }
    }
  } finally {
    remote?.close()
    state.lastRunAt = new Date().toISOString()
    state.lastUploaded = uploaded
    await saveSyncState(state, statePath)
  }

  return { configured: true, total: files.length, uploaded, pending: leftOver + failed, failed }
}

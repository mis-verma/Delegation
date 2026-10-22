import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { planUploads, runUploadsSync, type LocalFile, type SyncState } from './uploadsSync.js'

const file = (rel: string, size = 10, mtimeMs = 1000): LocalFile => ({ rel, size, mtimeMs })
const stateOf = (...files: LocalFile[]): SyncState => ({
  files: Object.fromEntries(files.map((f) => [f.rel, { size: f.size, mtimeMs: f.mtimeMs }])),
  lastRunAt: null,
  lastUploaded: 0,
})

describe('planUploads', () => {
  it('skips files that are already copied and unchanged', () => {
    const a = file('a.jpg')
    const plan = planUploads([a, file('b.jpg')], stateOf(a), 10)
    expect(plan.toUpload.map((f) => f.rel)).toEqual(['b.jpg'])
    expect(plan.pending).toBe(0)
  })

  it('copies a file again when its size or time changed', () => {
    const plan = planUploads([file('a.jpg', 20, 2000)], stateOf(file('a.jpg', 10, 1000)), 10)
    expect(plan.toUpload).toHaveLength(1)
  })

  it('sends the newest files first and reports what is left over', () => {
    const plan = planUploads([file('old.jpg', 1, 1), file('new.jpg', 1, 9), file('mid.jpg', 1, 5)], stateOf(), 2)
    expect(plan.toUpload.map((f) => f.rel)).toEqual(['new.jpg', 'mid.jpg'])
    expect(plan.pending).toBe(1)
  })
})

describe('runUploadsSync', () => {
  let dir = ''
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
  })

  it('uploads new files once, remembers them, and retries failures', async () => {
    dir = await mkdtemp(join(tmpdir(), 'uploads-sync-'))
    const root = join(dir, 'uploads')
    await mkdir(join(root, 'ticket-attachments'), { recursive: true })
    await writeFile(join(root, 'ticket-attachments', 'one.jpg'), 'one')
    await writeFile(join(root, 'two.jpg'), 'two')
    const stateFile = join(dir, 'state.json')

    const sent: string[] = []
    const flaky = async (f: LocalFile) => {
      if (f.rel === 'two.jpg' && !sent.includes('two-failed')) {
        sent.push('two-failed')
        throw new Error('network')
      }
      sent.push(f.rel)
    }

    const first = await runUploadsSync({ upload: flaky, root, stateFile })
    expect(first).toMatchObject({ configured: true, total: 2, uploaded: 1, failed: 1, pending: 1 })

    const second = await runUploadsSync({ upload: flaky, root, stateFile })
    expect(second).toMatchObject({ uploaded: 1, failed: 0, pending: 0 })

    const third = await runUploadsSync({ upload: flaky, root, stateFile })
    expect(third).toMatchObject({ uploaded: 0, failed: 0, pending: 0 })
    expect(sent.filter((r) => r === 'ticket-attachments/one.jpg')).toHaveLength(1)
  })
})

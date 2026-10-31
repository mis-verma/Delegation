import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { countJsonArrayRows, openJsonArray } from './jsonArrayFile.js'

let dir = ''

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'json-array-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('json array file', () => {
  it('writes rows in batches as one valid JSON list and counts them back', async () => {
    const file = join(dir, 'a.json')
    const writer = openJsonArray(file)
    await writer.write([{ id: 'a', note: 'line\nbreak' }, { id: 'b', note: 'x' }])
    await writer.write([{ id: 'c', note: '[]' }])
    expect(await writer.close()).toBe(3)
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { id: string; note: string }[]
    expect(parsed.map((r) => r.id)).toEqual(['a', 'b', 'c'])
    expect(parsed[0]?.note).toBe('line\nbreak')
    expect(await countJsonArrayRows(file)).toBe(3)
  })

  it('writes an empty table as an empty list', async () => {
    const file = join(dir, 'empty.json')
    const writer = openJsonArray(file)
    expect(await writer.close()).toBe(0)
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual([])
    expect(await countJsonArrayRows(file)).toBe(0)
  })

  it('rejects a file that was cut short or has a broken row', async () => {
    const cut = join(dir, 'cut.json')
    await writeFile(cut, '[\n{"id":"a"},\n{"id":"b"}')
    await expect(countJsonArrayRows(cut)).rejects.toThrow()
    const broken = join(dir, 'broken.json')
    await writeFile(broken, '[\n{"id":"a"},\n{"id":\n]\n')
    await expect(countJsonArrayRows(broken)).rejects.toThrow()
  })
})

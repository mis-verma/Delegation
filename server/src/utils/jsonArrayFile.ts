import { createReadStream, createWriteStream } from 'node:fs'
import { once } from 'node:events'
import { createInterface } from 'node:readline'

export interface JsonArrayWriter {
  write: (rows: readonly unknown[]) => Promise<void>
  close: () => Promise<number>
}

export const openJsonArray = (file: string): JsonArrayWriter => {
  const out = createWriteStream(file)
  let count = 0
  let failure: Error | null = null
  out.on('error', (err) => { failure = err })

  const push = async (text: string) => {
    if (failure) throw failure
    if (!out.write(text)) await once(out, 'drain')
  }

  return {
    write: async (rows) => {
      for (const row of rows) {
        await push(`${count === 0 ? '[\n' : ',\n'}${JSON.stringify(row)}`)
        count += 1
      }
    },
    close: async () => {
      await push(count === 0 ? '[]\n' : '\n]\n')
      out.end()
      await once(out, 'finish')
      if (failure) throw failure
      return count
    },
  }
}

export const countJsonArrayRows = async (file: string): Promise<number> => {
  const lines = createInterface({ input: createReadStream(file, 'utf8'), crlfDelay: Infinity })
  let rows = 0
  let opened = false
  let closed = false
  for await (const line of lines) {
    if (line === '[]') { opened = true; closed = true; continue }
    if (line === '[') { opened = true; continue }
    if (line === ']') { closed = true; continue }
    if (!opened || closed) throw new Error('The file has rows outside the list.')
    JSON.parse(line.endsWith(',') ? line.slice(0, -1) : line)
    rows += 1
  }
  if (!opened || !closed) throw new Error('The file is not a complete list.')
  return rows
}

import fs from "node:fs"

const WINDOW_MS = 10 * 60_000

type Incoming = { originalname: string; size: number; path: string }
type Saved = { originalFilename: string | null; sizeBytes: number }

const keyOf = (name: string | null, size: number) => `${name ?? ""}|${size}`

export const repeatWindowStart = (): Date => new Date(Date.now() - WINDOW_MS)

export const splitRepeatedUploads = <F extends Incoming, S extends Saved>(files: F[], saved: S[]): { fresh: F[]; already: S[] } => {
    const known = new Map(saved.map((row) => [keyOf(row.originalFilename, row.sizeBytes), row]))
    const fresh: F[] = []
    const already: S[] = []
    for (const file of files) {
        const hit = known.get(keyOf(file.originalname, file.size))
        if (hit) {
            fs.unlink(file.path, () => {})
            already.push(hit)
        } else {
            fresh.push(file)
        }
    }
    return { fresh, already }
}

import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import type { NextFunction, Request, Response } from "express"
import sharp from "sharp"

const UPLOADS_ROOT = path.resolve("uploads")
const VARIANTS_ROOT = path.join(UPLOADS_ROOT, ".variants")
const WIDTHS = [160, 320, 640, 1280] as const
const SOURCE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"])
const JPEG_QUALITY = 80
const CACHE_SECONDS = 86_400
const STALE_AFTER_DAYS = 30
const DAY_MS = 86_400_000

const inFlight = new Map<string, Promise<string | null>>()

export const snapWidth = (raw: unknown): number | null => {
    const requested = Number(raw)
    if (!Number.isFinite(requested) || requested <= 0) return null
    return WIDTHS.find((w) => w >= requested) ?? WIDTHS[WIDTHS.length - 1]!
}

const resolveSource = (urlPath: string): string | null => {
    let decoded: string
    try {
        decoded = decodeURIComponent(urlPath)
    } catch {
        return null
    }
    const full = path.resolve(UPLOADS_ROOT, `.${decoded}`)
    if (!full.startsWith(UPLOADS_ROOT + path.sep)) return null
    if (full.startsWith(VARIANTS_ROOT + path.sep)) return null
    if (!SOURCE_EXTENSIONS.has(path.extname(full).toLowerCase())) return null
    return full
}

const exists = (file: string) => fs.stat(file).then(() => true, () => false)

const build = async (source: string, width: number): Promise<string | null> => {
    const stat = await fs.stat(source).catch(() => null)
    if (!stat?.isFile()) return null
    const key = crypto.createHash("sha1").update(`${source}:${stat.mtimeMs}:${stat.size}`).digest("hex")
    const target = path.join(VARIANTS_ROOT, String(width), `${key}.jpg`)
    if (await exists(target)) {
        const now = new Date()
        fs.utimes(target, now, now).catch(() => undefined)
        return target
    }
    await fs.mkdir(path.dirname(target), { recursive: true })
    const temp = `${target}.${process.pid}.tmp`
    await sharp(source, { failOn: "none" })
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(temp)
    await fs.rename(temp, target)
    return target
}

export const imageVariantPath = (urlPath: string, rawWidth: unknown): Promise<string | null> => {
    const width = snapWidth(rawWidth)
    const source = resolveSource(urlPath)
    if (!width || !source) return Promise.resolve(null)
    const flightKey = `${source}:${width}`
    const running = inFlight.get(flightKey)
    if (running) return running
    const job = build(source, width).finally(() => inFlight.delete(flightKey))
    inFlight.set(flightKey, job)
    return job
}

export const purgeStaleVariants = async (maxAgeDays = STALE_AFTER_DAYS): Promise<number> => {
    const cutoff = Date.now() - maxAgeDays * DAY_MS
    let removed = 0
    const widths = await fs.readdir(VARIANTS_ROOT).catch(() => [] as string[])
    for (const width of widths) {
        const folder = path.join(VARIANTS_ROOT, width)
        const names = await fs.readdir(folder).catch(() => [] as string[])
        for (const name of names) {
            const file = path.join(folder, name)
            const stat = await fs.stat(file).catch(() => null)
            if (stat?.isFile() && stat.mtimeMs < cutoff) {
                await fs.rm(file, { force: true })
                removed += 1
            }
        }
    }
    return removed
}

export const serveImageVariant = (req: Request, res: Response, next: NextFunction) => {
    if (req.query.w === undefined) {
        next()
        return
    }
    imageVariantPath(req.path, req.query.w)
        .then((file) => {
            if (!file) {
                next()
                return
            }
            res.setHeader("Cache-Control", `private, max-age=${CACHE_SECONDS}`)
            res.sendFile(file, { dotfiles: "allow" }, (err) => {
                if (err && !res.headersSent) next()
            })
        })
        .catch(() => next())
}

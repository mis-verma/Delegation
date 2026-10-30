import fs from "node:fs"
import path from "node:path"

const UPLOADS_ROOT = path.resolve("uploads")

export const removeUploadedFile = (url: string) => {
    const relative = url.replace(/^\/?uploads\//, "")
    const target = path.resolve(UPLOADS_ROOT, relative)
    if (!target.startsWith(UPLOADS_ROOT + path.sep)) return
    fs.unlink(target, (err) => {
        if (err && err.code !== "ENOENT") console.error("Failed to delete uploaded file:", err)
    })
}

import fs from "node:fs"
import type { NextFunction, Request, Response } from "express"

type UploadedRequest = Request & {
    file?: Express.Multer.File
    files?: Express.Multer.File[] | Record<string, Express.Multer.File[]>
}

const uploadedPaths = (req: UploadedRequest): string[] => {
    const collected: Express.Multer.File[] = []
    if (Array.isArray(req.files)) collected.push(...req.files)
    else if (req.files) collected.push(...Object.values(req.files).flat())
    if (req.file) collected.push(req.file)
    return collected.map((file) => file.path).filter((path) => !!path)
}

export const discardUploadsOnFailure = (req: Request, res: Response, next: NextFunction) => {
    res.on("finish", () => {
        if (res.statusCode < 400) return
        for (const path of uploadedPaths(req)) fs.unlink(path, () => undefined)
    })
    next()
}

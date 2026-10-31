import multer from "multer";
import path from "node:path";
import crypto from "node:crypto"
import fs from "node:fs"
import type { Request, Response, NextFunction } from "express"
import { settingsService } from "../modules/settings/settings.service.js";

const UPLOAD_DIR = path.resolve("uploads", "tasks")

const TICKET_UPLOAD_DIR = path.resolve("uploads", "tickets")

const TICKET_ATTACHMENT_UPLOAD_DIR = path.resolve("uploads", "ticket-attachments")

const CHECKLIST_INSTANCE_UPLOAD_DIR = path.resolve("uploads", "checklist-instances")

const CHECKLIST_INSTANCE_SUBMISSION_UPLOAD_DIR = path.resolve("uploads", "checklist-instance-submissions")

const TASK_ATTACHMENT_UPLOAD_DIR = path.resolve("uploads", "task-attachments")

const AVATAR_UPLOAD_DIR = path.resolve("uploads", "avatars")

const LOGO_UPLOAD_DIR = path.resolve("uploads", "logos")

const TASK_COMMENT_ATTACHMENT_UPLOAD_DIR = path.resolve("uploads", "task-comment-attachments")

const CHECKLIST_REFERENCE_UPLOAD_DIR = path.resolve("uploads", "checklist-references")

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(TICKET_UPLOAD_DIR)) {
    fs.mkdirSync(TICKET_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(TICKET_ATTACHMENT_UPLOAD_DIR)) {
    fs.mkdirSync(TICKET_ATTACHMENT_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(CHECKLIST_INSTANCE_UPLOAD_DIR)) {
    fs.mkdirSync(CHECKLIST_INSTANCE_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(CHECKLIST_INSTANCE_SUBMISSION_UPLOAD_DIR)) {
    fs.mkdirSync(CHECKLIST_INSTANCE_SUBMISSION_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(TASK_ATTACHMENT_UPLOAD_DIR)) {
    fs.mkdirSync(TASK_ATTACHMENT_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(TASK_COMMENT_ATTACHMENT_UPLOAD_DIR)) {
    fs.mkdirSync(TASK_COMMENT_ATTACHMENT_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(AVATAR_UPLOAD_DIR)) {
    fs.mkdirSync(AVATAR_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(LOGO_UPLOAD_DIR)) {
    fs.mkdirSync(LOGO_UPLOAD_DIR, { recursive: true })
}
if (!fs.existsSync(CHECKLIST_REFERENCE_UPLOAD_DIR)) {
    fs.mkdirSync(CHECKLIST_REFERENCE_UPLOAD_DIR, { recursive: true })
}

const SAFE_MIME_EXTENSIONS: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/avif": ".avif",
    "image/bmp": ".bmp",
    "image/tiff": ".tiff",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "application/pdf": ".pdf",
    "text/csv": ".csv",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
}

const safeExtensionFor = (mimetype: string): string => SAFE_MIME_EXTENSIONS[mimetype] ?? ".bin"

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
});

const ticketStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TICKET_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const ticketAttachmentStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TICKET_ATTACHMENT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const checklistInstanceStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHECKLIST_INSTANCE_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const checklistInstanceSubmissionStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHECKLIST_INSTANCE_SUBMISSION_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const taskAttachmentStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TASK_ATTACHMENT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATAR_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const logoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LOGO_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const checklistReferenceStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, CHECKLIST_REFERENCE_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const taskCommentAttachmentStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TASK_COMMENT_ATTACHMENT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

const CHECKLIST_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"]
const CHECKLIST_VIDEO_MIN_SIZE_MB = 100

const buildImageUpload = ( storageEngine : multer.StorageEngine, extraMimeTypes: string[] = []) => {
    const settings = settingsService.getCached();
    const fileSizeMb = extraMimeTypes.length ? Math.max(settings.maxUploadSizeMb, CHECKLIST_VIDEO_MIN_SIZE_MB) : settings.maxUploadSizeMb
    return multer({
        storage : storageEngine,
        limits : {
            fileSize : fileSizeMb * 1024 * 1024,
            files : settings.maxUploadFiles,
        },

        fileFilter:(_req, file, cb) => {
            if(!settings.allowedImageTypes.includes(file.mimetype) && !extraMimeTypes.includes(file.mimetype)){
                return cb(null, false)
            }

            cb(null, true)
        }

    })
}

export const taskImageUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(storage).array("images" , settingsService.getCached().maxUploadFiles)(req, res, next)
}

export const checklistImageUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(ticketStorage).array("images", settingsService.getCached().maxUploadFiles)(req, res, next)
}

export const ticketAttachmentUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(ticketAttachmentStorage).array("images", settingsService.getCached().maxUploadFiles)(req, res, next)
}

const dropOversizedImages = (req: Request, next: NextFunction) => (err?: unknown) => {
    if (err) return next(err)
    const capBytes = settingsService.getCached().maxUploadSizeMb * 1024 * 1024
    const files = Array.isArray(req.files) ? req.files : []
    req.files = files.filter((file) => {
        if (file.mimetype.startsWith("video/") || file.size <= capBytes) return true
        fs.unlink(file.path, () => {})
        return false
    })
    next()
}

export const checklistInstanceImageUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = Math.max(settingsService.getCached().maxUploadSizeMb, CHECKLIST_VIDEO_MIN_SIZE_MB)
    return buildImageUpload(checklistInstanceStorage, CHECKLIST_VIDEO_MIME_TYPES).array("images", settingsService.getCached().maxUploadFiles)(req, res, dropOversizedImages(req, next))
}

export const checklistInstanceItemSubmissionImageUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = Math.max(settingsService.getCached().maxUploadSizeMb, CHECKLIST_VIDEO_MIN_SIZE_MB)
    return buildImageUpload(checklistInstanceSubmissionStorage, CHECKLIST_VIDEO_MIME_TYPES).array("images", settingsService.getCached().maxUploadFiles)(req, res, dropOversizedImages(req, next))
}

export const checklistReferenceUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(checklistReferenceStorage).single("image")(req, res, next)
}

export const avatarUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(avatarStorage).single("avatar")(req, res, next)
}

export const logoUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(logoStorage).single("logo")(req, res, next)
}

const TASK_ATTACHMENT_MIME_TYPES = [
    "application/pdf",
    "text/csv",
    "application/vnd.ms-excel",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "video/mp4",
    "video/quicktime",
    "video/webm",
]

const TASK_ATTACHMENT_MAX_FILES = 8
const TASK_ATTACHMENT_MAX_SIZE_MB = 25

const taskAttachmentMulter = multer({
    storage: taskAttachmentStorage,
    limits: {
        fileSize: TASK_ATTACHMENT_MAX_SIZE_MB * 1024 * 1024,
        files: TASK_ATTACHMENT_MAX_FILES,
    },
    fileFilter: (_req, file, cb) => {
        if (!TASK_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
            return cb(null, false)
        }
        cb(null, true)
    },
})

export const taskAttachmentUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = TASK_ATTACHMENT_MAX_SIZE_MB
    return taskAttachmentMulter.array("files", TASK_ATTACHMENT_MAX_FILES)(req, res, next)
}

const CHECKLIST_BULK_IMPORT_MIME_TYPES = [
    "text/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/pdf",
]
const CHECKLIST_BULK_IMPORT_MAX_SIZE_MB = 10

const checklistBulkImportMulter = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: CHECKLIST_BULK_IMPORT_MAX_SIZE_MB * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!CHECKLIST_BULK_IMPORT_MIME_TYPES.includes(file.mimetype)) {
            return cb(null, false)
        }
        cb(null, true)
    },
})

export const checklistBulkImportUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = CHECKLIST_BULK_IMPORT_MAX_SIZE_MB
    return checklistBulkImportMulter.single("file")(req, res, next)
}

const taskCommentAttachmentMulter = multer({
    storage: taskCommentAttachmentStorage,
    limits: {
        fileSize: TASK_ATTACHMENT_MAX_SIZE_MB * 1024 * 1024,
        files: TASK_ATTACHMENT_MAX_FILES,
    },
    fileFilter: (_req, file, cb) => {
        if (!TASK_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
            return cb(null, false)
        }
        cb(null, true)
    },
})

export const taskCommentAttachmentUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = TASK_ATTACHMENT_MAX_SIZE_MB
    return taskCommentAttachmentMulter.array("files", TASK_ATTACHMENT_MAX_FILES)(req, res, next)
}

const VOICE_NOTE_MIME_TYPES = [
    "audio/webm",
    "audio/ogg",
    "audio/mp4",
    "audio/mpeg",
    "audio/wav",
    "audio/mp3",
]
const VOICE_NOTE_MAX_SIZE_MB = 20

const voiceNoteMulter = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: VOICE_NOTE_MAX_SIZE_MB * 1024 * 1024,
        files: 1,
    },
    fileFilter: (_req, file, cb) => {
        if (!VOICE_NOTE_MIME_TYPES.includes(file.mimetype)) {
            return cb(null, false)
        }
        cb(null, true)
    },
})

export const voiceNoteUpload = (req : Request , res : Response , next : NextFunction) => {
    res.locals.uploadLimitMb = VOICE_NOTE_MAX_SIZE_MB
    return voiceNoteMulter.single("audio")(req, res, next)
}
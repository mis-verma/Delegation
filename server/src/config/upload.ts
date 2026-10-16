import multer from "multer";
import path from "node:path";
import crypto from "node:crypto"
import fs from "node:fs"
import type { Request, Response, NextFunction } from "express"
import { settingsService } from "../modules/settings/settings.service.js";

// Where uploaded task-evidence images actually get saved on disk. path.resolve() makes this an
// absolute path, so it works the same regardless of which directory the Node process was
// started from.
const UPLOAD_DIR = path.resolve("uploads", "tasks")

// Same idea, but for evidence photos uploaded against a Ticket's checklist items (see
// checklistImages module) — kept in its own folder, separate from task evidence.
const TICKET_UPLOAD_DIR = path.resolve("uploads", "tickets")

// General ticket-level attachments/screenshots (see ticketAttachments module) — not tied to a
// checklist item, kept in its own folder so the two features' files never collide.
const TICKET_ATTACHMENT_UPLOAD_DIR = path.resolve("uploads", "ticket-attachments")

// Evidence photos uploaded against a recurring ChecklistInstance's items (see
// checklistInstanceImages module) — kept separate from the Ticket-side checklistImages folder.
const CHECKLIST_INSTANCE_UPLOAD_DIR = path.resolve("uploads", "checklist-instances")

// Evidence photos uploaded against one auditor's ChecklistInstanceItemSubmission (see
// checklistInstanceItemSubmissionImages module) — an AUDIT item's photos belong to a specific
// auditor's submission, not the item's own pool, so they get their own folder too.
const CHECKLIST_INSTANCE_SUBMISSION_UPLOAD_DIR = path.resolve("uploads", "checklist-instance-submissions")

// General task-level attachments (see taskAttachments module) — reference docs/photos/videos
// attached directly to a Task, not to a checklist item. Kept separate from the tasks/ image
// folder since these aren't gated by the same image-only rules.
const TASK_ATTACHMENT_UPLOAD_DIR = path.resolve("uploads", "task-attachments")

// A user's profile picture (see users module) — one file per user, its own folder so it's never
// confused with task/ticket evidence photos.
const AVATAR_UPLOAD_DIR = path.resolve("uploads", "avatars")

// The org's uploaded logo (see settings module) — a single file replacing itself on re-upload,
// same one-file-per-scope shape as avatars, just scoped to the org instead of a user.
const LOGO_UPLOAD_DIR = path.resolve("uploads", "logos")

// Files attached to a single Task comment/activity message (see taskComments module) — kept in
// its own folder rather than reusing task-attachments/ so a comment's files are never confused
// with the task's own top-level attachment list.
const TASK_COMMENT_ATTACHMENT_UPLOAD_DIR = path.resolve("uploads", "task-comment-attachments")


// A fresh clone of this repo won't have an uploads/ folder yet — we don't (and shouldn't) commit
// an empty folder of user-uploaded content to git, so create it at startup if it's missing.

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

// The stored extension used to come from `path.extname(file.originalname)` — but both
// `originalname` and `mimetype` are attacker-controlled multipart fields, and `fileFilter` only
// checks `mimetype`. That let a request pass the filter with `Content-Type: image/jpeg` while
// naming the file `x.html`, which then got saved as `<hex>.html` and served back as `text/html`
// by app.ts's `express.static(uploads)` — stored XSS on the app's own origin. The extension now
// comes from this fixed mimetype->extension map instead, completely ignoring `originalname`. Any
// mimetype that reaches a `filename` callback has already passed that upload's `fileFilter`, so
// the `.bin` fallback below is defense-in-depth only (e.g. an admin adding an exotic mimetype to
// `allowedImageTypes` that isn't in this map yet) — it never serves as an executable extension.
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

const taskCommentAttachmentStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TASK_COMMENT_ATTACHMENT_UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const randomName = crypto.randomBytes(16).toString("hex");
        cb(null, `${randomName}${safeExtensionFor(file.mimetype)}`)
    },
})

// Recurring-checklist VIDEO_UPLOAD items reuse the exact same evidence-photo pipeline (same
// ChecklistInstanceImage model/route, same "images" field) rather than a separate upload path —
// the only difference is the file itself can be a video. Fixed allowlist, not admin-editable like
// allowedImageTypes, since it's a narrow feature-specific exception rather than a general setting.
const CHECKLIST_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"]
const CHECKLIST_VIDEO_MIN_SIZE_MB = 100

// Builds a brand-new multer instance using whatever's currently in the settings cache. This is
// cheap (no I/O — multer() just wires up config objects), so it's fine to call fresh on every
// request instead of caching the instance: it means admin-edited upload limits/mime types take
// effect immediately, with no server restart needed. `extraMimeTypes` widens the allowlist beyond
// the admin-configured allowedImageTypes for callers with their own fixed exception (see
// CHECKLIST_VIDEO_MIME_TYPES above) — empty by default, so every other caller's behavior is
// unchanged.

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
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(storage).array("images" , settingsService.getCached().maxUploadFiles)(req, res, next)
}

export const checklistImageUpload = (req : Request , res : Response , next : NextFunction) => {
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(ticketStorage).array("images", settingsService.getCached().maxUploadFiles)(req, res, next)
}

export const ticketAttachmentUpload = (req : Request , res : Response , next : NextFunction) => {
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(ticketAttachmentStorage).array("images", settingsService.getCached().maxUploadFiles)(req, res, next)
}

export const checklistInstanceImageUpload = (req : Request , res : Response , next : NextFunction) => {
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = Math.max(settingsService.getCached().maxUploadSizeMb, CHECKLIST_VIDEO_MIN_SIZE_MB)
    return buildImageUpload(checklistInstanceStorage, CHECKLIST_VIDEO_MIME_TYPES).array("images", settingsService.getCached().maxUploadFiles)(req, res, next)
}

export const checklistInstanceItemSubmissionImageUpload = (req : Request , res : Response , next : NextFunction) => {
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = Math.max(settingsService.getCached().maxUploadSizeMb, CHECKLIST_VIDEO_MIN_SIZE_MB)
    return buildImageUpload(checklistInstanceSubmissionStorage, CHECKLIST_VIDEO_MIME_TYPES).array("images", settingsService.getCached().maxUploadFiles)(req, res, next)
}

// One file, not an array — a profile picture replaces the previous one rather than adding to a
// pool. Still image-only/size-limited via the same admin-editable settings as the rest.
export const avatarUpload = (req : Request , res : Response , next : NextFunction) => {
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(avatarStorage).single("avatar")(req, res, next)
}

// One file, org-wide — a re-upload replaces the previous logo rather than adding to a pool.
export const logoUpload = (req : Request , res : Response , next : NextFunction) => {
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = settingsService.getCached().maxUploadSizeMb
    return buildImageUpload(logoStorage).single("logo")(req, res, next)
}

// Task-level attachments accept documents/spreadsheets/video too, not just images — the
// admin-editable `allowedImageTypes` setting (and buildImageUpload above) is scoped to the
// evidence-photo features and stays image-only, so this gets its own fixed allowlist instead.
const TASK_ATTACHMENT_MIME_TYPES = [
    "application/pdf",
    "text/csv",
    "application/vnd.ms-excel", // some browsers/OSes report .csv as this instead of text/csv
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
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = TASK_ATTACHMENT_MAX_SIZE_MB
    return taskAttachmentMulter.array("files", TASK_ATTACHMENT_MAX_FILES)(req, res, next)
}

// Bulk checklist-assignment import (see checklistBulkImport module) — the uploaded file (CSV,
// Excel, or a best-effort PDF) only exists to be parsed into rows; unlike every other upload
// above, nothing about it needs to persist afterward, so this is the one upload in the app that
// uses memoryStorage instead of a disk folder — there's no uploads/ subdirectory to create or
// clean up for it.
const CHECKLIST_BULK_IMPORT_MIME_TYPES = [
    "text/csv",
    "application/vnd.ms-excel", // some browsers/OSes report .csv as this instead of text/csv
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
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = CHECKLIST_BULK_IMPORT_MAX_SIZE_MB
    return checklistBulkImportMulter.single("file")(req, res, next)
}

// Comment attachments reuse the same allowed types/limits as task-level attachments — same kind
// of files (docs/images/video), just scoped to one comment instead of the whole task.
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
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = TASK_ATTACHMENT_MAX_SIZE_MB
    return taskCommentAttachmentMulter.array("files", TASK_ATTACHMENT_MAX_FILES)(req, res, next)
}

// Web Smart Add's voice-note recorder (client/src/features/tasks/VoiceNoteRecorder.tsx) — the
// clip only needs to reach the transcription service once and can then be discarded, so this uses
// memory storage rather than one of the disk-backed folders above; nothing here ever gets saved.
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
    // Read by errorHandler so a too-big file is told the limit of THIS upload, not a general one.
    res.locals.uploadLimitMb = VOICE_NOTE_MAX_SIZE_MB
    return voiceNoteMulter.single("audio")(req, res, next)
}
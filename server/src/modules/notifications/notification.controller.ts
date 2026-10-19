import type { Request , Response } from "express" // Express types for the request/response objects
import { notificationService } from "./notification.service.js" // service layer with the actual notification logic (database + socket work)
import { z } from "zod"
import { pushService } from "./push.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js" // wraps async handlers so errors are forwarded to Express's error middleware instead of crashing

// The notification controller exposes HTTP endpoints for the in-app notification system.
// Notifications are little messages shown to a user (e.g. "Ticket X was assigned to you") so they
// know something happened without having to go check manually. Each notification has an isRead flag
// so the UI can show an unread badge/count and let the user dismiss things they've already seen.
const HHMM = z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/)
const subscribeSchema = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().min(1).max(255), auth: z.string().min(1).max(255) }) })
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(2048) })
const unreadSchema = z.object({ ids: z.array(z.string().min(1).max(191)).min(1).max(500) })
const prefsSchema = z.object({ quietStart: HHMM.nullable(), quietEnd: HHMM.nullable(), morningDigest: z.boolean() })

export const notificationController = {
    markUnread : asyncHandler(async (req : Request , res : Response) => {
        const { ids } = unreadSchema.parse(req.body)
        await notificationService.markUnread(req.user!.sub, ids)
        res.json({ success : true })
    }),

    pushStatus : asyncHandler(async (req : Request , res : Response) => {
        res.json({ success : true, data : { configured : pushService.isConfigured(), publicKey : pushService.publicKey(), devices : await pushService.deviceCount(req.user!.sub) } })
    }),

    pushSubscribe : asyncHandler(async (req : Request , res : Response) => {
        if (!pushService.isConfigured()) { res.status(503).json({ success : false, message : "Push notifications are not set up on this server yet." }); return }
        await pushService.subscribe(req.user!.sub, subscribeSchema.parse(req.body), req.get("user-agent") ?? undefined)
        res.json({ success : true })
    }),

    pushUnsubscribe : asyncHandler(async (req : Request , res : Response) => {
        await pushService.unsubscribe(req.user!.sub, unsubscribeSchema.parse(req.body).endpoint)
        res.json({ success : true })
    }),

    getPreferences : asyncHandler(async (req : Request , res : Response) => {
        res.json({ success : true, data : await pushService.getPreferences(req.user!.sub) })
    }),

    savePreferences : asyncHandler(async (req : Request , res : Response) => {
        res.json({ success : true, data : await pushService.savePreferences(req.user!.sub, prefsSchema.parse(req.body)) })
    }),

    // GET /  -> returns the list of notifications belonging to the currently logged-in user
    list : asyncHandler( async (req : Request , res : Response) => {
        // req.user is set by the auth middleware after verifying the JWT; "sub" is the user's id (subject claim)
        const notifications = await notificationService.listForUser(req.user!.sub)
        res.json({ success : true , data : notifications })
    }),

    // PATCH /:id/read -> marks ONE specific notification (by its id) as read for the current user
    markRead : asyncHandler(async (req : Request , res : Response) => {
        const notification = await notificationService.markRead(req.params.id , req.user!.sub);
        res.json({ success : true, data : notification})
    }),

    // PATCH /read-all -> marks ALL of the current user's unread notifications as read in one go
    // (different from markRead, which only touches a single notification by id)
    markAllRead : asyncHandler(async (req : Request , res : Response) => {
        await notificationService.markAllRead(req.user!.sub);
        res.json({ success : true})
    })
}
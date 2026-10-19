import type { Request , Response } from "express"
import { notificationService } from "./notification.service.js"
import { z } from "zod"
import { pushService } from "./push.service.js"
import { asyncHandler } from "../../utils/asyncHandler.js"

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

    list : asyncHandler( async (req : Request , res : Response) => {
        const notifications = await notificationService.listForUser(req.user!.sub)
        res.json({ success : true , data : notifications })
    }),

    markRead : asyncHandler(async (req : Request , res : Response) => {
        const notification = await notificationService.markRead(req.params.id , req.user!.sub);
        res.json({ success : true, data : notification})
    }),

    markAllRead : asyncHandler(async (req : Request , res : Response) => {
        await notificationService.markAllRead(req.user!.sub);
        res.json({ success : true})
    })
}
import { Router } from "express";
import { notificationController } from "./notification.controller.js";
import { authenticate } from "../../middleware/auth/auth.js";

export const notificationRouter = Router()
notificationRouter.use(authenticate)

notificationRouter.get("/push", notificationController.pushStatus)
notificationRouter.post("/push/subscribe", notificationController.pushSubscribe)
notificationRouter.post("/push/unsubscribe", notificationController.pushUnsubscribe)
notificationRouter.get("/preferences", notificationController.getPreferences)
notificationRouter.put("/preferences", notificationController.savePreferences)
notificationRouter.patch("/unread", notificationController.markUnread)
notificationRouter.get("/", notificationController.list);
notificationRouter.patch("/:id/read", notificationController.markRead)
notificationRouter.patch("/read-all", notificationController.markAllRead)
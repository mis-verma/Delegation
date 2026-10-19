import { Router } from "express"; // Express's Router for grouping related endpoints together
import { notificationController } from "./notification.controller.js"; // the controller functions that handle each notification route
import { authenticate } from "../../middleware/auth/auth.js"; // middleware that checks the request has a valid logged-in user

export const notificationRouter = Router() // create a mini router just for notification-related endpoints
notificationRouter.use(authenticate) // every route below requires the user to be logged in - notifications are personal, so you must be authenticated to see or manage your own

notificationRouter.get("/push", notificationController.pushStatus)
notificationRouter.post("/push/subscribe", notificationController.pushSubscribe)
notificationRouter.post("/push/unsubscribe", notificationController.pushUnsubscribe)
notificationRouter.get("/preferences", notificationController.getPreferences)
notificationRouter.put("/preferences", notificationController.savePreferences)
notificationRouter.patch("/unread", notificationController.markUnread)
notificationRouter.get("/", notificationController.list); // GET /            -> list the current user's notifications
notificationRouter.patch("/:id/read", notificationController.markRead) // PATCH /:id/read  -> mark one specific notification as read
notificationRouter.patch("/read-all", notificationController.markAllRead) // PATCH /read-all  -> mark ALL of the current user's notifications as read
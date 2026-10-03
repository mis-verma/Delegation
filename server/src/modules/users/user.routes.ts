import { Router } from "express"
import { userController } from "./user.controller.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { avatarUpload } from "../../config/upload.js"

// This creates a mini "mini app" of routes that we'll mount under something like /api/users
// in the main app. Keeping routes in their own file per module keeps things organized.
export const userRouter = Router()

// Every route below this line requires the caller to be logged in (have a valid access token).
// The `authenticate` middleware checks the token and attaches the decoded user info to req.user.
userRouter.use(authenticate)

// IMPORTANT: this route is defined BEFORE the `requireRole('ADMIN', 'PC')` line below, so it
// is only gated by `authenticate` (any logged-in user), not by admin/PC-only access.
// This is the endpoint the ticket-assignment picker calls to get a list of users that can be
// assigned to a ticket. Any authenticated user (not just admins) needs to be able to see this,
// otherwise a regular manager/agent couldn't assign tickets to teammates.
userRouter.get("/assignable", userController.listAssignable)

// Self-service routes — any authenticated user can read/edit their OWN record this way, same as
// /assignable above (still only `authenticate`-gated, not `requireRole` below). Registered before
// the `/:id` routes further down so "/me" is matched as this literal path, never as `:id = "me"`.
userRouter.get("/me", userController.getMe)
userRouter.patch("/me", userController.updateMe)
userRouter.post("/me/password", userController.changeOwnPassword)
userRouter.post("/me/avatar", avatarUpload, userController.uploadMyAvatar)
userRouter.delete("/me/avatar", userController.removeMyAvatar)

// From this point on, every route ALSO requires the logged-in user to have the 'ADMIN' or 'PC'
// role — PC has full parity with ADMIN throughout this app, including user management.
userRouter.use(requireRole('ADMIN', 'PC'))
// GET /  -> list every user in the system (admin/PC only)
userRouter.get("/", userController.list)
// GET /presence -> who's online right now + everyone's last-active time (admin/PC only).
// Registered before /:id so "presence" is matched as this literal path, never as :id = "presence".
userRouter.get("/presence", userController.presence)
// PATCH /bulk -> change department/store/role of many people at once (admin/PC only).
// Registered before the /:id routes so "bulk" is matched as this literal path, never as :id = "bulk".
userRouter.patch("/bulk", userController.bulkUpdate)
// GET /:id -> look up a single user by their Mongo _id (admin/PC only)
userRouter.get("/:id", userController.getOne)
// POST / -> create a brand new user account (admin/PC only)
userRouter.post("/", userController.create)
// PATCH /:id -> partially update a user (e.g. change role, deactivate, etc.) (admin/PC only)
userRouter.patch("/:id", userController.update)
// GET /:id/offboarding -> what this person still holds; POST /:id/offboard -> hand it over and deactivate them
userRouter.get("/:id/offboarding", userController.offboardingSummary)
userRouter.post("/:id/offboard", userController.offboard)
// POST /:id/reset-password -> admin/PC sets this user's password directly (admin/PC only)
userRouter.post("/:id/reset-password", userController.resetPassword)
// POST /:id/avatar -> upload/replace this user's profile picture (admin/PC only)
userRouter.post("/:id/avatar", avatarUpload, userController.uploadAvatar)
// DELETE /:id/avatar -> remove this user's profile picture (admin/PC only)
userRouter.delete("/:id/avatar", userController.removeAvatar)
// DELETE /:id -> permanently remove a user (admin/PC only)
userRouter.delete("/:id", userController.remove)

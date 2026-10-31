import { Router } from "express"
import { userController } from "./user.controller.js"
import { authenticate, requireRole } from "../../middleware/auth/auth.js"
import { avatarUpload } from "../../config/upload.js"
import { protectAdminAccounts } from "./adminAccountGuard.js"

export const userRouter = Router()

userRouter.use(authenticate)

userRouter.get("/assignable", userController.listAssignable)

userRouter.get("/me", userController.getMe)
userRouter.patch("/me", userController.updateMe)
userRouter.post("/me/password", userController.changeOwnPassword)
userRouter.post("/me/avatar", avatarUpload, userController.uploadMyAvatar)
userRouter.delete("/me/avatar", userController.removeMyAvatar)

userRouter.use(requireRole('ADMIN', 'PC'))
userRouter.get("/", userController.list)
userRouter.get("/presence", userController.presence)
userRouter.patch("/bulk", protectAdminAccounts, userController.bulkUpdate)
userRouter.get("/:id", userController.getOne)
userRouter.post("/", protectAdminAccounts, userController.create)
userRouter.patch("/:id", protectAdminAccounts, userController.update)
userRouter.get("/:id/offboarding", userController.offboardingSummary)
userRouter.post("/:id/offboard", protectAdminAccounts, userController.offboard)
userRouter.post("/:id/reset-password", protectAdminAccounts, userController.resetPassword)
userRouter.post("/:id/send-password-code", protectAdminAccounts, userController.sendPasswordCode)
userRouter.post("/:id/avatar", protectAdminAccounts, avatarUpload, userController.uploadAvatar)
userRouter.delete("/:id/avatar", protectAdminAccounts, userController.removeAvatar)
userRouter.delete("/:id", protectAdminAccounts, userController.remove)

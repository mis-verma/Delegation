import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { activityController } from "./activity.controller.js"

export const activityRouter = Router()

activityRouter.use(authenticate)
activityRouter.get("/", activityController.feed)

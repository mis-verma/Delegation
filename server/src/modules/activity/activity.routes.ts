import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { activityController } from "./activity.controller.js"

export const activityRouter = Router()

activityRouter.use(authenticate)
// Any signed-in user. The service decides who may read which record's history.
activityRouter.get("/", activityController.feed)

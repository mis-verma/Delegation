import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { scoreController } from "./score.controller.js"

export const scoreRouter = Router()

scoreRouter.use(authenticate)
// Any signed-in user. The service decides whose scores they may open.
scoreRouter.get("/person", scoreController.person)

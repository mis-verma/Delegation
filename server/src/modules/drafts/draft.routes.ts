import { Router } from "express"
import { authenticate } from "../../middleware/auth/auth.js"
import { draftController } from "./draft.controller.js"

export const draftRouter = Router()
draftRouter.use(authenticate)

draftRouter.get("/", draftController.list)
draftRouter.get("/:id", draftController.getOne)
draftRouter.post("/", draftController.create)
draftRouter.patch("/:id", draftController.update)
draftRouter.delete("/:id", draftController.remove)

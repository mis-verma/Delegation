import { z } from "zod"

export const objectId = z.string().min(1).max(191, "Invalid id")

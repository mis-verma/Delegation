import { z } from "zod";
import { CAPTURE_METHODS } from "../../db/schema/task.js";

export const uploadImageSchema = z.object({
    captureMethod: z.enum(CAPTURE_METHODS),
});

export type UploadImageInput = z.infer<typeof uploadImageSchema>;
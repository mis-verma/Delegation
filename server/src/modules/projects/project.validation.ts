import { z } from "zod";
import { objectId } from "../../utils/index.js"

export const createProjectSchema = z.object({
    name : z.string().min(1),
    description : z.string().optional(),
    memberIds : z.array(objectId).optional()
});

export const updateProjectSchema = createProjectSchema.partial()

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;

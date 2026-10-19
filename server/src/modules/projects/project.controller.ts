import type { Request, Response } from 'express';
import { projectService } from './project.service.js';
import { createProjectSchema, updateProjectSchema } from './project.validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const projectController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const projects = await projectService.list(req.user!);
    res.json({ success: true, data: projects });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const project = await projectService.getById(req.params.id, req.user!);
    res.json({ success: true, data: project });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const input = createProjectSchema.parse(req.body);
    const project = await projectService.create(input, req.user!);
    res.status(201).json({ success: true, data: project });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const input = updateProjectSchema.parse(req.body);
    const project = await projectService.update(req.params.id, input, req.user!);
    res.json({ success: true, data: project });
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await projectService.remove(req.params.id, req.user!);
    res.json({ success: true, data: { deleted: true } });
  }),
};
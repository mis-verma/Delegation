import type { Request, Response } from 'express';
import { checklistService } from './checklist.service.js';
import { createChecklistSchema, updateChecklistItemSchema, updateRemarksSchema } from './checklist.validation.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const checklistController = {
  addToTicket: asyncHandler(async (req: Request, res: Response) => {
    const input = createChecklistSchema.parse(req.body);
    const checklist = await checklistService.addToTicket(req.params.ticketId, input);
    res.status(201).json({ success: true, data: checklist });
  }),

  addFromTemplateToTicket: asyncHandler(async (req: Request, res: Response) => {
    const checklist = await checklistService.addFromTemplateToTicket(req.params.ticketId, req.params.templateId);
    res.status(201).json({ success: true, data: checklist });
  }),

  removeChecklist: asyncHandler(async (req: Request, res: Response) => {
    await checklistService.removeChecklist(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),

  updateItem: asyncHandler(async (req: Request, res: Response) => {
    const input = updateChecklistItemSchema.parse(req.body);
    const item = await checklistService.updateItem(req.params.id, input, req.user!);
    res.json({ success: true, data: item });
  }),

  completeItem: asyncHandler(async (req: Request, res: Response) => {
    const item = await checklistService.completeItem(req.params.id, req.user!);
    res.json({ success: true, data: item });
  }),

  updateRemarks: asyncHandler(async (req: Request, res: Response) => {
    const { remarks } = updateRemarksSchema.parse(req.body);
    const item = await checklistService.updateRemarks(req.params.id, remarks, req.user!);
    res.json({ success: true, data: item });
  }),

  removeItem: asyncHandler(async (req: Request, res: Response) => {
    await checklistService.removeItem(req.params.id);
    res.json({ success: true, data: { deleted: true } });
  }),
};
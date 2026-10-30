import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRole } from '../../middleware/auth/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { AppError } from '../../utils/AppError.js';
import { exceptionService } from './exception.service.js';
import { attentionService } from './attention.service.js';
import { approvalTatService } from '../reports/approvalTat.service.js';
import { isAdminOrPc } from "../../utils/roles.js"
import { routeParam } from "../../utils/routeParam.js"

export const exceptionRouter = Router();

const OVERSIGHT = ['ADMIN', 'PC', 'MANAGER', 'SENIOR'] as const;
const DAY = z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'Use a date like 2026-10-01');
const optionalId = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().min(1).max(191).optional());
const filterSchema = z.object({ departmentId: optionalId, storeId: optionalId });
const heatmapSchema = filterSchema
  .extend({ from: DAY, to: DAY })
  .refine((q) => q.from <= q.to, 'From must be on or before To')
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 62 * 86_400_000, 'Pick at most two months');
const remindSchema = z.object({ userIds: z.array(z.string().min(1).max(191)).min(1).max(300) });
const approvalSchema = z
  .object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) })
  .refine((q) => Date.parse(q.from) < Date.parse(q.to), 'From must be before To');

exceptionRouter.use(authenticate);
exceptionRouter.get('/', requireRole(...OVERSIGHT), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await exceptionService.list(req.user!) });
}));
exceptionRouter.get('/people', requireRole(...OVERSIGHT), asyncHandler(async (req, res) => {
  const filter = filterSchema.parse(req.query);
  res.json({ success: true, data: await attentionService.people(req.user!, filter) });
}));
exceptionRouter.post('/people/remind', requireRole(...OVERSIGHT), asyncHandler(async (req, res) => {
  const { userIds } = remindSchema.parse(req.body);
  res.json({ success: true, data: await attentionService.remind(req.user!, userIds) });
}));
exceptionRouter.get('/people/:id', requireRole(...OVERSIGHT), asyncHandler(async (req, res) => {
  const id = z.string().min(1).max(191).parse(routeParam(req, "id"));
  res.json({ success: true, data: await attentionService.person(req.user!, id) });
}));
exceptionRouter.get('/heatmap', requireRole(...OVERSIGHT), asyncHandler(async (req, res) => {
  const { from, to, ...filter } = heatmapSchema.parse(req.query);
  res.json({ success: true, data: await attentionService.heatmap(req.user!, from, to, filter) });
}));
exceptionRouter.get('/approvals', requireRole(...OVERSIGHT), asyncHandler(async (req, res) => {
  const { from, to } = approvalSchema.parse(req.query);
  const user = req.user!;
  const orgWide = isAdminOrPc(user.role);
  if (!orgWide && !user.departmentId) throw AppError.forbidden();
  res.json({ success: true, data: await approvalTatService.summary(new Date(from), new Date(to), Date.now(), orgWide ? undefined : user.departmentId) });
}));
const approvalDaysSchema = z
  .object({ from: DAY, to: DAY })
  .refine((q) => q.from <= q.to, 'From must be on or before To')
  .refine((q) => Date.parse(q.to) - Date.parse(q.from) <= 31 * 86_400_000, 'Pick at most a month');
exceptionRouter.get('/approvals/daily', requireRole(...OVERSIGHT), asyncHandler(async (req, res) => {
  const { from, to } = approvalDaysSchema.parse(req.query);
  const user = req.user!;
  const orgWide = isAdminOrPc(user.role);
  if (!orgWide && !user.departmentId) throw AppError.forbidden();
  res.json({ success: true, data: await approvalTatService.daily(from, to, Date.now(), orgWide ? undefined : user.departmentId) });
}));

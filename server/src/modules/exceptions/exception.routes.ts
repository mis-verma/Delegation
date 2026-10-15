import { Router } from 'express';
import { authenticate, requireRole } from '../../middleware/auth/auth.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import { exceptionService } from './exception.service.js';

export const exceptionRouter = Router();

exceptionRouter.use(authenticate);
// Oversight only: each role gets what its own ticket and checklist scoping already allows.
exceptionRouter.get('/', requireRole('ADMIN', 'PC', 'MANAGER', 'SENIOR'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await exceptionService.list(req.user!) });
}));
exceptionRouter.get('/people', requireRole('ADMIN', 'PC', 'MANAGER', 'SENIOR'), asyncHandler(async (req, res) => {
  res.json({ success: true, data: await exceptionService.people(req.user!) });
}));

import { Router } from 'express';
import { ticketController } from './ticket.controller.js';
import { ticketBulkImportController } from './ticketBulkImport.controller.js';
import { checklistController } from '../checklists/checklist.controller.js';
import { ticketAttachmentController } from '../ticketAttachments/ticketAttachment.controller.js';
import { ticketAttachmentUpload, checklistBulkImportUpload } from '../../config/upload.js';
import { ticketCommentController } from '../ticketComments/ticketComment.controller.js';
import { authenticate, requireRole } from '../../middleware/auth/auth.js';

export const ticketRouter = Router();

ticketRouter.use(authenticate);
ticketRouter.get('/', ticketController.list);
ticketRouter.get('/summary', ticketController.summary);
ticketRouter.get('/pending-approval', requireRole('ADMIN', 'PC', 'MANAGER', 'SENIOR'), ticketController.pendingApproval);
ticketRouter.get('/reports/tat', requireRole('ADMIN', 'PC', 'MANAGER', 'SENIOR'), ticketController.tatReport);
ticketRouter.get('/reports/by-owner', requireRole('ADMIN', 'PC', 'MANAGER', 'SENIOR'), ticketController.ownerStats);
ticketRouter.get('/:id', ticketController.getOne);

ticketRouter.post('/', ticketController.create);

ticketRouter.post('/bulk-import/preview', requireRole('ADMIN', 'PC'), checklistBulkImportUpload, ticketBulkImportController.preview);
ticketRouter.post('/bulk-import/publish', requireRole('ADMIN', 'PC'), ticketBulkImportController.publish);
ticketRouter.patch('/:id', ticketController.update);
ticketRouter.post('/:id/status-updates', ticketAttachmentUpload, ticketController.addStatusUpdate);
ticketRouter.patch('/:id/verify', ticketController.verify);
ticketRouter.post('/:id/decline', ticketController.decline);
ticketRouter.post('/:id/approve-assignment', ticketController.approveAssignment);
ticketRouter.delete('/:id', ticketController.remove);

ticketRouter.post('/:ticketId/checklists', requireRole('ADMIN', 'PC'), checklistController.addToTicket);
ticketRouter.post('/:ticketId/checklists/from-template/:templateId', requireRole('ADMIN', 'PC'), checklistController.addFromTemplateToTicket);

ticketRouter.post('/:ticketId/attachments', ticketAttachmentUpload, ticketAttachmentController.upload);

ticketRouter.post('/:ticketId/comments', ticketCommentController.create);
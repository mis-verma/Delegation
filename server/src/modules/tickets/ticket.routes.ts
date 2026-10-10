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
// Registered before '/:id', same as task.routes.ts's own '/summary' — always "mine", so open to
// every authenticated role.
ticketRouter.get('/summary', ticketController.summary);
// Dashboard's "Needs your approval" card — org-wide, so gated to the roles that can actually
// verify a ticket (matches assertCanVerify's own ADMIN/PC check inside the service).
ticketRouter.get('/pending-approval', requireRole('ADMIN', 'PC'), ticketController.pendingApproval);
ticketRouter.get('/reports/tat', requireRole('ADMIN', 'PC', 'MANAGER', 'SENIOR'), ticketController.tatReport);
ticketRouter.get('/reports/by-owner', requireRole('ADMIN', 'PC', 'MANAGER', 'SENIOR'), ticketController.ownerStats);
ticketRouter.get('/:id', ticketController.getOne);

ticketRouter.post('/', ticketController.create);

// Bulk-create tickets from an uploaded CSV/Excel file — see ticketBulkImport.service.ts. ADMIN/PC
// only, matching the equivalent Delegation bulk-import route's gate. Reuses the checklist
// feature's own upload middleware (generic CSV/XLSX/PDF file-type + size validation, nothing
// checklist-specific about it) rather than standing up a near-identical second multer instance.
ticketRouter.post('/bulk-import/preview', requireRole('ADMIN', 'PC'), checklistBulkImportUpload, ticketBulkImportController.preview);
ticketRouter.post('/bulk-import/publish', requireRole('ADMIN', 'PC'), ticketBulkImportController.publish);
ticketRouter.patch('/:id', ticketController.update);
ticketRouter.post('/:id/status-updates', ticketAttachmentUpload, ticketController.addStatusUpdate);
// No role gate here anymore — a named reviewer (ticket.service.ts's ticketReviewers, additive on
// top of the role-based rule) can be any role at all, so who's actually allowed to verify THIS
// ticket has to be checked in the service against the specific row, not generically at the
// router. See ticket.service.ts's assertCanVerify, and the same decision made for Task/verify.
ticketRouter.patch('/:id/verify', ticketController.verify);
// No role gate: ADMIN/PC delete anything, and the person who raised a ticket can withdraw it while
// nobody has started on it. Both rules need the ticket row, so ticket.service.ts#remove decides.
ticketRouter.delete('/:id', ticketController.remove);

ticketRouter.post('/:ticketId/checklists', requireRole('ADMIN', 'PC'), checklistController.addToTicket);
ticketRouter.post('/:ticketId/checklists/from-template/:templateId', requireRole('ADMIN', 'PC'), checklistController.addFromTemplateToTicket);

ticketRouter.post('/:ticketId/attachments', ticketAttachmentUpload, ticketAttachmentController.upload);

ticketRouter.post('/:ticketId/comments', ticketCommentController.create);
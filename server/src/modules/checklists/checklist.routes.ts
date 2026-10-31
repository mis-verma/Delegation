import { Router } from 'express';
import { checklistController } from './checklist.controller.js';
import { authenticate, requireRole } from '../../middleware/auth/auth.js';
import { checklistImageController } from '../checklistImages/checklistImage.controller.js';
import { checklistImageUpload } from '../../config/upload.js';

export const checklistRouter = Router();

checklistRouter.use(authenticate);
checklistRouter.delete('/:id', requireRole("ADMIN"), checklistController.removeChecklist);

export const checklistItemRouter = Router();
checklistItemRouter.use(authenticate);
checklistItemRouter.patch('/:id', checklistController.updateItem);
checklistItemRouter.patch('/:id/remarks', checklistController.updateRemarks);
checklistItemRouter.post('/:id/complete', checklistController.completeItem);
checklistItemRouter.delete('/:id', requireRole("ADMIN"), checklistController.removeItem);
checklistItemRouter.post('/:id/images', checklistImageUpload, checklistImageController.upload);

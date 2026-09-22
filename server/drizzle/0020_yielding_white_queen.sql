ALTER TABLE `TaskStatusUpdate` MODIFY COLUMN `fromStatus` enum('draft','todo','in_progress','pending_approval','done') NOT NULL;--> statement-breakpoint
ALTER TABLE `TaskStatusUpdate` MODIFY COLUMN `toStatus` enum('draft','todo','in_progress','pending_approval','done') NOT NULL;--> statement-breakpoint
ALTER TABLE `Task` MODIFY COLUMN `status` enum('draft','todo','in_progress','pending_approval','done') NOT NULL DEFAULT 'todo';--> statement-breakpoint
ALTER TABLE `TicketStatusUpdate` MODIFY COLUMN `toStatus` enum('IN_PROGRESS','ON_HOLD','PENDING_APPROVAL') NOT NULL;--> statement-breakpoint
ALTER TABLE `Ticket` MODIFY COLUMN `status` enum('OPEN','IN_PROGRESS','PENDING_APPROVAL','CLOSED','ON_HOLD') NOT NULL DEFAULT 'OPEN';--> statement-breakpoint
ALTER TABLE `ChecklistInstance` MODIFY COLUMN `verificationStatus` enum('NOT_SUBMITTED','PENDING_APPROVAL','APPROVED','REJECTED') NOT NULL DEFAULT 'NOT_SUBMITTED';
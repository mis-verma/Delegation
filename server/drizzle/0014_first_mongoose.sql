ALTER TABLE `TaskStatusUpdate` MODIFY COLUMN `fromStatus` enum('draft','todo','in_progress','pending_verification','done') NOT NULL;--> statement-breakpoint
ALTER TABLE `TaskStatusUpdate` MODIFY COLUMN `toStatus` enum('draft','todo','in_progress','pending_verification','done') NOT NULL;--> statement-breakpoint
ALTER TABLE `Task` MODIFY COLUMN `status` enum('draft','todo','in_progress','pending_verification','done') NOT NULL DEFAULT 'todo';--> statement-breakpoint
ALTER TABLE `Task` ADD `deletedAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistTemplate` ADD `deletedAt` datetime;--> statement-breakpoint
ALTER TABLE `Ticket` ADD `deletedAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistDefinition` ADD `deletedAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `draftReminderSentAt` datetime;--> statement-breakpoint
CREATE INDEX `ChecklistTemplate_deletedAt_idx` ON `ChecklistTemplate` (`deletedAt`);--> statement-breakpoint
CREATE INDEX `Ticket_deletedAt_idx` ON `Ticket` (`deletedAt`);--> statement-breakpoint
CREATE INDEX `ChecklistDefinition_deletedAt_idx` ON `ChecklistDefinition` (`deletedAt`);--> statement-breakpoint
CREATE INDEX `ChecklistInstance_draftReminderSentAt_idx` ON `ChecklistInstance` (`draftReminderSentAt`);
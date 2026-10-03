ALTER TABLE `ChecklistDefinitionItem` ADD `isCritical` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ChecklistInstanceItem` ADD `isCritical` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `approvalReminderSentAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `approvalEscalatedAt` datetime;
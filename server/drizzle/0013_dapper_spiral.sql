ALTER TABLE `ChecklistInstance` ADD `overdueNotifiedAt` datetime;--> statement-breakpoint
CREATE INDEX `ChecklistInstance_overdueNotifiedAt_idx` ON `ChecklistInstance` (`overdueNotifiedAt`);
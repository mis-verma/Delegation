ALTER TABLE `ChecklistInstance` ADD `deletedAt` datetime;
--> statement-breakpoint
CREATE INDEX `ChecklistInstance_deletedAt_idx` ON `ChecklistInstance` (`deletedAt`);

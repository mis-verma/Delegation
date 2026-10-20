ALTER TABLE `ChecklistDefinition` ADD `lateUntilTime` varchar(5);--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `lateUntilTime` varchar(5);--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `lateEndNotifiedAt` datetime;
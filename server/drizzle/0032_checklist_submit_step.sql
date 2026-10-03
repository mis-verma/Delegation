ALTER TABLE `ChecklistInstance` ADD `submittedAt` datetime;--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `submittedBy` varchar(191);--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD CONSTRAINT `ChecklistInstance_submittedBy_User_id_fk` FOREIGN KEY (`submittedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
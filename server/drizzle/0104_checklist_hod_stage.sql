ALTER TABLE `ChecklistInstance` ADD `approvalStage` enum('HOD','PC');
--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `hodApprovedBy` varchar(191);
--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD `hodApprovedAt` datetime;
--> statement-breakpoint
ALTER TABLE `ChecklistInstance` ADD CONSTRAINT `ChecklistInstance_hodApprovedBy_User_id_fk` FOREIGN KEY (`hodApprovedBy`) REFERENCES `User`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
UPDATE `ChecklistInstance` SET `approvalStage` = 'PC' WHERE `verificationStatus` = 'PENDING_APPROVAL';
